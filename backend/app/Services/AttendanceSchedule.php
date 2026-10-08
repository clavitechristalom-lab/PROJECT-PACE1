<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Setting;
use Carbon\Carbon;

/**
 * Central attendance schedule rules.
 *
 *   TIME IN   08:00 AM
 *   CUT OFF   08:05 AM   (arrivals after this are LATE)
 *   LUNCH OUT 12:00 PM
 *   LUNCH IN  01:00 PM
 *   TIME OUT  05:00 PM   (work after this is OVERTIME)
 *
 * Values can be overridden through the `settings` table using the keys below.
 */
class AttendanceSchedule
{
    public const DEFAULTS = [
        'schedule_time_in'   => '08:00',
        'schedule_cutoff'    => '08:05',
        'schedule_lunch_out' => '12:00',
        'schedule_lunch_in'  => '13:00',
        'schedule_time_out'  => '17:00',
    ];

    /** Minutes before scheduled Lunch Out where a scan is treated as LUNCH OUT. */
    public const LUNCH_EARLY_WINDOW = 30;

    protected static ?array $cache = null;

    public static function get(): array
    {
        if (self::$cache !== null) return self::$cache;

        $values = self::DEFAULTS;
        try {
            $stored = Setting::whereIn('key', array_keys(self::DEFAULTS))->pluck('value', 'key')->toArray();
            foreach ($stored as $k => $v) {
                if (is_string($v) && preg_match('/^\d{1,2}:\d{2}/', $v)) {
                    $values[$k] = substr($v, 0, 5);
                }
            }
        } catch (\Throwable $e) {
            // settings table unavailable — fall back to defaults
        }
        return self::$cache = $values;
    }

    /** Schedule formatted for API responses. */
    public static function toArray(): array
    {
        $s = self::get();
        $fmt = fn ($t) => date('h:i A', strtotime($t));
        return [
            'time_in'   => $s['schedule_time_in'],
            'cutoff'    => $s['schedule_cutoff'],
            'lunch_out' => $s['schedule_lunch_out'],
            'lunch_in'  => $s['schedule_lunch_in'],
            'time_out'  => $s['schedule_time_out'],
            'labels' => [
                'time_in'   => $fmt($s['schedule_time_in']),
                'cutoff'    => $fmt($s['schedule_cutoff']),
                'lunch_out' => $fmt($s['schedule_lunch_out']),
                'lunch_in'  => $fmt($s['schedule_lunch_in']),
                'time_out'  => $fmt($s['schedule_time_out']),
            ],
        ];
    }

    protected static function at(string $date, string $time): Carbon
    {
        return Carbon::parse("$date $time");
    }

    /** Present or Late based on cut-off. */
    public static function statusForTimeIn(Carbon $scan): string
    {
        $cutoff = self::at($scan->format('Y-m-d'), self::get()['schedule_cutoff']);
        return $scan->gt($cutoff->copy()->addSeconds(59)) ? 'Late' : 'Present';
    }

    /** Minutes late measured from scheduled TIME IN (only when past cut-off). */
    public static function lateMinutes(?string $date, ?string $timeIn): int
    {
        if (!$date || !$timeIn) return 0;
        $s = self::get();
        $in = self::at($date, $timeIn);
        $cutoff = self::at($date, $s['schedule_cutoff'])->addSeconds(59);
        if ($in->lte($cutoff)) return 0;
        return (int) floor(self::at($date, $s['schedule_time_in'])->diffInMinutes($in));
    }

    /** Minutes left before scheduled TIME OUT. */
    public static function undertimeMinutes(?string $date, ?string $timeOut): int
    {
        if (!$date || !$timeOut) return 0;
        $out = self::at($date, $timeOut);
        $sched = self::at($date, self::get()['schedule_time_out']);
        return $out->lt($sched) ? (int) floor($out->diffInMinutes($sched)) : 0;
    }

    /** Decide the next punch action for a record at the given scan time. */
    public static function nextAction(?Attendance $record, Carbon $scan): string
    {
        if (!$record) return 'TIME_IN';
        if ($record->time_out) return 'COMPLETED';
        if ($record->lunch_out && !$record->lunch_in) return 'LUNCH_IN';

        if (!$record->lunch_out) {
            $s = self::get();
            $date = $scan->format('Y-m-d');
            $windowStart = self::at($date, $s['schedule_lunch_out'])->subMinutes(self::LUNCH_EARLY_WINDOW);
            $windowEnd = self::at($date, $s['schedule_lunch_in']);
            if ($scan->gte($windowStart) && $scan->lt($windowEnd)) {
                return 'LUNCH_OUT';
            }
        }
        return 'TIME_OUT';
    }

    /**
     * Compute regular / overtime / total hours.
     * - Regular hours: time worked inside the TIME IN → TIME OUT window, minus lunch (max 8h).
     * - Lunch: actual lunch scans if both present, otherwise the scheduled lunch hour overlap.
     * - Overtime: time worked after scheduled TIME OUT.
     */
    public static function computeHours(Attendance $record): array
    {
        $date = $record->attendance_date instanceof \DateTimeInterface
            ? $record->attendance_date->format('Y-m-d')
            : substr((string) $record->attendance_date, 0, 10);

        if (!$record->time_in || !$record->time_out) {
            return ['regular' => 0, 'overtime' => 0, 'total' => 0];
        }

        $s = self::get();
        $in  = self::at($date, $record->time_in);
        $out = self::at($date, $record->time_out);
        if ($out->lte($in)) return ['regular' => 0, 'overtime' => 0, 'total' => 0];

        $schedIn  = self::at($date, $s['schedule_time_in']);
        $schedOut = self::at($date, $s['schedule_time_out']);

        $overlap = function (Carbon $a1, Carbon $a2, Carbon $b1, Carbon $b2) {
            $start = $a1->gt($b1) ? $a1 : $b1;
            $end = $a2->lt($b2) ? $a2 : $b2;
            return max(0, $end->getTimestamp() - $start->getTimestamp());
        };

        // Regular window: no credit before scheduled TIME IN or after TIME OUT
        $regStart = $in->gt($schedIn) ? $in : $schedIn;
        $regEnd = $out->lt($schedOut) ? $out : $schedOut;
        $regularSeconds = max(0, $regEnd->getTimestamp() - $regStart->getTimestamp());

        // Lunch deduction
        if ($record->lunch_out && $record->lunch_in) {
            $lo = self::at($date, $record->lunch_out);
            $li = self::at($date, $record->lunch_in);
            $lunchSeconds = $li->gt($lo) ? $overlap($lo, $li, $regStart, $regEnd) : 0;
        } else {
            $lunchSeconds = $overlap(
                self::at($date, $s['schedule_lunch_out']),
                self::at($date, $s['schedule_lunch_in']),
                $regStart,
                $regEnd
            );
        }
        $regularSeconds = max(0, $regularSeconds - $lunchSeconds);
        $regular = min(8, round($regularSeconds / 3600, 2));

        $overtimeSeconds = $out->gt($schedOut) ? $out->getTimestamp() - max($schedOut->getTimestamp(), $in->getTimestamp()) : 0;
        $overtime = round(max(0, $overtimeSeconds) / 3600, 2);

        return [
            'regular' => $regular,
            'overtime' => $overtime,
            'total' => round($regular + $overtime, 2),
        ];
    }

    /** Apply a punch action to a record and persist it. */
    public static function applyAction(Attendance $record, string $action, Carbon $scan): Attendance
    {
        $now = $scan->format('H:i:s');

        switch ($action) {
            case 'TIME_IN':
                $record->attendance_date = $scan->format('Y-m-d');
                $record->time_in = $now;
                $record->status = self::statusForTimeIn($scan);
                $record->total_hours = 0;
                $record->overtime_hours = 0;
                break;
            case 'LUNCH_OUT':
                $record->lunch_out = $now;
                break;
            case 'LUNCH_IN':
                $record->lunch_in = $now;
                break;
            case 'TIME_OUT':
                $record->time_out = $now;
                $hours = self::computeHours($record);
                $record->total_hours = $hours['total'];
                $record->overtime_hours = $hours['overtime'];
                // Keep Late status; mark Half Day if fewer than 4 regular hours rendered
                if ($hours['regular'] < 4) {
                    $record->status = 'Half Day';
                } elseif (!in_array($record->status, ['Late', 'Present'])) {
                    $record->status = self::statusForTimeIn(self::at($record->attendance_date, $record->time_in));
                }
                break;
        }

        $record->save();
        return $record;
    }

    /** Uniform API representation of an attendance record. */
    public static function present(Attendance $a): array
    {
        $date = substr((string) $a->attendance_date, 0, 10);
        $fmt = fn ($t) => $t ? date('h:i A', strtotime($t)) : '';
        $raw = fn ($t) => $t ? date('H:i', strtotime($t)) : '';
        $hours = ($a->time_in && $a->time_out) ? self::computeHours($a) : ['regular' => 0, 'overtime' => 0, 'total' => 0];

        return [
            'time_in' => $fmt($a->time_in),
            'lunch_out' => $fmt($a->lunch_out),
            'lunch_in' => $fmt($a->lunch_in),
            'time_out' => $fmt($a->time_out),
            'time_in_raw' => $raw($a->time_in),
            'lunch_out_raw' => $raw($a->lunch_out),
            'lunch_in_raw' => $raw($a->lunch_in),
            'time_out_raw' => $raw($a->time_out),
            'late_minutes' => self::lateMinutes($date, $a->time_in),
            'undertime_minutes' => self::undertimeMinutes($date, $a->time_out),
            'regular_hours' => $hours['regular'],
            'overtime_hours' => $a->time_out ? $hours['overtime'] : (float) $a->overtime_hours,
            'total_hours' => $a->time_out ? $hours['total'] : (float) $a->total_hours,
        ];
    }
}
