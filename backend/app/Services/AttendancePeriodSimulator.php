<?php

namespace App\Services;

use App\Http\Controllers\SyncController;
use App\Models\Attendance;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AttendancePeriodSimulator
{
    public const DEFAULT_START_DATE = '2026-10-12';
    public const DEFAULT_END_DATE   = '2026-11-20';

    public const REASON_CODES = [
        'SL'   => ['label' => 'Sick Leave (Medical)', 'default_status' => 'Excused'],
        'EL'   => ['label' => 'Emergency Leave (Family)', 'default_status' => 'Excused'],
        'VL'   => ['label' => 'Vacation / Scheduled Leave', 'default_status' => 'Excused'],
        'PL'   => ['label' => 'Personal Errand / Matter', 'default_status' => 'Unexcused'],
        'AWOL' => ['label' => 'Unnotified Absence (No Advisory)', 'default_status' => 'Unexcused'],
        'NCNS' => ['label' => 'No Call / No Show', 'default_status' => 'Unexcused'],
    ];

    /**
     * All scheduled Monday–Saturday workdays within [$startDate, $endDate].
     */
    public static function scheduledDates(string $startDate = self::DEFAULT_START_DATE, string $endDate = self::DEFAULT_END_DATE): array
    {
        $cur = Carbon::parse($startDate)->startOfDay();
        $end = Carbon::parse($endDate)->startOfDay();
        $dates = [];

        while ($cur->lte($end)) {
            if ((int) $cur->format('N') <= 6) {
                $dates[] = $cur->format('Y-m-d');
            }
            $cur->addDay();
        }

        return $dates;
    }

    /**
     * Eligible Store Admin and General Staff (Employees) ordered by ID.
     */
    public static function targetStaffQuery(?string $branchFilter = null, ?string $roleFilter = null)
    {
        $query = Employee::with(['user:user_id,employee_id,username,role', 'branchProfile:id,name'])
            ->where(function ($q) {
                $q->whereIn('department', ['Store Admin', 'Employee', 'Staff'])
                  ->orWhereHas('user', fn ($uq) => $uq->whereIn('role', ['Store Administrator', 'Store Admin', 'Employee', 'Staff']));
            })
            ->where(function ($ex) {
                $ex->whereNull('position')
                   ->orWhere(function ($p) {
                       $p->where('position', 'NOT LIKE', '%System Administrator%')
                         ->where('position', '!=', 'Administrator');
                   });
            });

        if ($branchFilter && !in_array($branchFilter, ['All', 'all'], true)) {
            if (is_numeric($branchFilter)) {
                $query->where('branch_id', (int) $branchFilter);
            } else {
                $query->where(function ($bq) use ($branchFilter) {
                    $bq->where('branch', $branchFilter)
                       ->orWhereHas('branchProfile', fn ($bp) => $bp->where('name', $branchFilter));
                });
            }
        }

        if ($roleFilter && !in_array($roleFilter, ['All', 'all'], true)) {
            $norm = strtolower(trim($roleFilter));
            if ($norm === 'store admin' || $norm === 'store administrator') {
                $query->where(function ($rq) {
                    $rq->where('department', 'Store Admin')
                       ->orWhere('position', 'LIKE', '%Store Admin%')
                       ->orWhereHas('user', fn ($uq) => $uq->whereIn('role', ['Store Administrator', 'Store Admin']));
                });
            } elseif ($norm === 'employee' || $norm === 'employees' || $norm === 'general staff') {
                $query->where('department', 'Employee')
                      ->where('position', 'NOT LIKE', '%Store Admin%')
                      ->where(function ($uq) {
                          $uq->whereDoesntHave('user')
                             ->orWhereHas('user', fn ($u) => $u->where('role', 'Employee'));
                      });
            }
        }

        return $query->orderBy('employee_id');
    }

    /**
     * Simulate and persist realistic attendance records from Oct 12 to Nov 20
     * for all Store Admin and Employees (General Staff).
     */
    public static function simulatePeriod(
        string $startDate = self::DEFAULT_START_DATE,
        string $endDate = self::DEFAULT_END_DATE,
        bool $forceOverwrite = false
    ): array {
        $scheduledDates = self::scheduledDates($startDate, $endDate);
        $totalScheduled = count($scheduledDates);
        if ($totalScheduled < 10) {
            return ['staff_count' => 0, 'records_created' => 0, 'records_updated' => 0];
        }

        $staffList = self::targetStaffQuery()->get();
        $hasDetailedCols = Schema::hasColumn('attendance', 'reason_code')
            && Schema::hasColumn('attendance', 'absence_status')
            && Schema::hasColumn('attendance', 'shift_type');

        $absenceTemplates = [
            ['SL', 'Excused', 'Sick Leave (Medical Consultation & Rest)'],
            ['EL', 'Excused', 'Emergency Leave (Family Matter)'],
            ['VL', 'Excused', 'Approved Personal / Vacation Leave'],
            ['AWOL', 'Unexcused', 'Unexcused Absence (No Prior Notice)'],
            ['PL', 'Unexcused', 'Unapproved Personal Absence'],
            ['NCNS', 'Unexcused', 'No Call / No Show Without Advisory'],
        ];

        $lateOffsetsPool = [7, 11, 14, 18, 22, 26, 9, 16, 24, 12, 20];
        $undertimeLostPool = [30, 45, 60, 75, 20, 40, 90];

        $createdCount = 0;
        $updatedCount = 0;

        DB::transaction(function () use (
            $staffList,
            $scheduledDates,
            $totalScheduled,
            $hasDetailedCols,
            $absenceTemplates,
            $lateOffsetsPool,
            $undertimeLostPool,
            $forceOverwrite,
            &$createdCount,
            &$updatedCount
        ) {
            foreach ($staffList as $idx => $emp) {
                $existingRows = Attendance::where('employee_id', $emp->employee_id)
                    ->whereIn('attendance_date', $scheduledDates)
                    ->get()
                    ->keyBy(fn ($r) => substr((string) $r->attendance_date, 0, 10));

                if ($forceOverwrite) {
                    Attendance::where('employee_id', $emp->employee_id)
                        ->whereIn('attendance_date', $scheduledDates)
                        ->delete();
                    $existingRows = collect();
                }

                // Preserve any existing real attendance dates (unless overwriting)
                $existingAbsentDates = $existingRows
                    ->filter(fn ($r) => $r->status === 'Absent')
                    ->keys()
                    ->values()
                    ->all();
                $existingPresentDates = $existingRows
                    ->filter(fn ($r) => $r->status !== 'Absent')
                    ->keys()
                    ->values()
                    ->all();

                // Pick exactly 4 Absence dates across the 35-day span
                $absentDates = $existingAbsentDates;
                $candidateAbsenceOffsets = [
                    3 + ($idx % 3),
                    11 + (($idx * 2) % 4),
                    20 + ($idx % 4),
                    28 + (($idx + 1) % 4),
                    16 + ($idx % 3),
                    7 + ($idx % 3),
                ];

                foreach ($candidateAbsenceOffsets as $offset) {
                    if (count($absentDates) >= 4) break;
                    $d = $scheduledDates[$offset % $totalScheduled] ?? null;
                    if ($d && !in_array($d, $absentDates, true) && !in_array($d, $existingPresentDates, true)) {
                        $absentDates[] = $d;
                    }
                }
                // Fallback scan in case collisions occurred
                foreach ($scheduledDates as $d) {
                    if (count($absentDates) >= 4) break;
                    if (!in_array($d, $absentDates, true) && !in_array($d, $existingPresentDates, true)) {
                        $absentDates[] = $d;
                    }
                }
                $absentDates = array_slice($absentDates, 0, 4);

                // Available dates for Lates, Undertime, Half-days, and Regular days
                $workCandidateDates = array_values(array_filter(
                    $scheduledDates,
                    fn ($d) => !in_array($d, $absentDates, true) && !in_array($d, $existingPresentDates, true)
                ));

                $isStoreAdmin = strtolower((string) $emp->department) === 'store admin'
                    || stripos((string) $emp->position, 'store admin') !== false;

                // Varying realistic counts per staff member
                $lateTarget = $isStoreAdmin ? 2 : (2 + ($idx % 4));       // 2 to 5 lates
                $undertimeTarget = $isStoreAdmin ? 1 : (1 + ($idx % 3));  // 1 to 3 early logouts
                $halfDayTarget = $isStoreAdmin ? 2 : (1 + (($idx + 1) % 3)); // 1 to 3 half-days

                $lateDates = [];
                $undertimeDates = [];
                $halfDayDates = [];

                $cursor = 0;
                $step = max(2, (int) floor(count($workCandidateDates) / max(1, ($lateTarget + $undertimeTarget + $halfDayTarget))));

                // Assign Half-day shifts
                for ($h = 0; $h < $halfDayTarget && !empty($workCandidateDates); $h++) {
                    $pos = ($cursor + $h * $step + 1) % count($workCandidateDates);
                    $cand = $workCandidateDates[$pos];
                    if (!in_array($cand, $halfDayDates, true)) {
                        $halfDayDates[] = $cand;
                    }
                }

                // Assign Undertime dates
                for ($u = 0; $u < $undertimeTarget && !empty($workCandidateDates); $u++) {
                    $tries = 0;
                    $pos = ($cursor + $u * $step + 2) % count($workCandidateDates);
                    while (in_array($workCandidateDates[$pos], $halfDayDates, true) || in_array($workCandidateDates[$pos], $undertimeDates, true)) {
                        $pos = ($pos + 1) % count($workCandidateDates);
                        if (++$tries >= count($workCandidateDates)) break;
                    }
                    $cand = $workCandidateDates[$pos];
                    if (!in_array($cand, $halfDayDates, true) && !in_array($cand, $undertimeDates, true)) {
                        $undertimeDates[] = $cand;
                    }
                }

                // Assign Late dates
                for ($l = 0; $l < $lateTarget && !empty($workCandidateDates); $l++) {
                    $tries = 0;
                    $pos = ($cursor + $l * $step) % count($workCandidateDates);
                    while (
                        in_array($workCandidateDates[$pos], $halfDayDates, true) ||
                        in_array($workCandidateDates[$pos], $undertimeDates, true) ||
                        in_array($workCandidateDates[$pos], $lateDates, true)
                    ) {
                        $pos = ($pos + 1) % count($workCandidateDates);
                        if (++$tries >= count($workCandidateDates)) break;
                    }
                    $cand = $workCandidateDates[$pos];
                    if (!in_array($cand, $halfDayDates, true) && !in_array($cand, $undertimeDates, true) && !in_array($cand, $lateDates, true)) {
                        $lateDates[] = $cand;
                    }
                }

                // Persist all scheduled dates in DB
                $absIndex = 0;
                $lateIdx = 0;
                $utIdx = 0;
                $hdIdx = 0;

                foreach ($scheduledDates as $dayIdx => $dateStr) {
                    $existing = $existingRows->get($dateStr);

                    if (in_array($dateStr, $absentDates, true)) {
                        // Ensure exactly 4 Absent rows with structured reason_code & excused/unexcused status
                        if ($existing && $existing->status === 'Absent') {
                            if ($hasDetailedCols && (empty($existing->reason_code) || empty($existing->absence_status))) {
                                $isExcusedExisting = stripos((string) $existing->remarks, 'excused') !== false;
                                $existing->reason_code = str_contains((string) $existing->remarks, 'Vacation') ? 'VL' : ($isExcusedExisting ? 'EL' : 'AWOL');
                                $existing->absence_status = $isExcusedExisting ? 'Excused' : 'Unexcused';
                                $existing->shift_type = 'ABSENT';
                                $existing->save();
                                $updatedCount++;
                            }
                            $absIndex++;
                            continue;
                        }

                        // Alternate Excused and Unexcused across the 4 absences (2 Excused + 2 Unexcused or 3+1)
                        $tplPick = ($absIndex % 2 === 0)
                            ? $absenceTemplates[($absIndex + $idx) % 3] // SL, EL, VL (Excused)
                            : $absenceTemplates[3 + (($absIndex + $idx) % 3)]; // AWOL, PL, NCNS (Unexcused)

                        $payload = [
                            'employee_id' => $emp->employee_id,
                            'scanned_by' => null,
                            'attendance_date' => $dateStr,
                            'time_in' => null,
                            'lunch_out' => null,
                            'lunch_in' => null,
                            'time_out' => null,
                            'total_hours' => 0.00,
                            'overtime_hours' => 0.00,
                            'status' => 'Absent',
                            'leave_type' => $tplPick[1] === 'Excused' ? 'Excused Absence' : 'Unexcused Absence',
                            'verification_method' => 'System Audit',
                            'verified_by_name' => 'Chris Clavite',
                            'remarks' => "[{$tplPick[0]}] {$tplPick[1]} — {$tplPick[2]}",
                        ];
                        if ($hasDetailedCols) {
                            $payload['reason_code'] = $tplPick[0];
                            $payload['absence_status'] = $tplPick[1];
                            $payload['shift_type'] = 'ABSENT';
                            $payload['late_minutes'] = 0;
                            $payload['undertime_minutes'] = 0;
                        }

                        Attendance::create($payload);
                        $createdCount++;
                        $absIndex++;
                        continue;
                    }

                    // Keep pre-existing real non-absent records intact, but enrich detailed cols if empty
                    if ($existing && $existing->status !== 'Absent') {
                        if ($hasDetailedCols && empty($existing->shift_type)) {
                            $existing->shift_type = $existing->status === 'Half Day' ? 'AM' : 'FULL';
                            $existing->late_minutes = $existing->status === 'Half Day'
                                ? 0
                                : AttendanceSchedule::lateMinutes($dateStr, $existing->time_in);
                            $existing->undertime_minutes = $existing->status === 'Half Day'
                                ? 0
                                : AttendanceSchedule::undertimeMinutes($dateStr, $existing->time_out);
                            $existing->save();
                            $updatedCount++;
                        }
                        continue;
                    }

                    if (in_array($dateStr, $halfDayDates, true)) {
                        $isAm = (($hdIdx + $idx) % 2 === 0);
                        $shiftType = $isAm ? 'AM' : 'PM';
                        $timeIn = $isAm ? '08:00:00' : '13:00:00';
                        $timeOut = $isAm ? '12:00:00' : '17:00:00';
                        $payload = [
                            'employee_id' => $emp->employee_id,
                            'scanned_by' => 3,
                            'attendance_date' => $dateStr,
                            'time_in' => $timeIn,
                            'lunch_out' => null,
                            'lunch_in' => null,
                            'time_out' => $timeOut,
                            'total_hours' => 4.00,
                            'overtime_hours' => 0.00,
                            'status' => 'Half Day',
                            'verification_method' => 'QR + PIN',
                            'verified_by_name' => 'Chris Clavite',
                            'remarks' => "Half-Day Shift ({$shiftType}) — 4.00 hrs rendered",
                        ];
                        if ($hasDetailedCols) {
                            $payload['shift_type'] = $shiftType;
                            $payload['late_minutes'] = 0;
                            $payload['undertime_minutes'] = 0;
                        }
                        Attendance::create($payload);
                        $createdCount++;
                        $hdIdx++;
                        continue;
                    }

                    if (in_array($dateStr, $undertimeDates, true)) {
                        $lostMins = $undertimeLostPool[($utIdx + $idx) % count($undertimeLostPool)];
                        $inMin = 48 + (($dayIdx + $idx) % 10);
                        $timeIn = sprintf('07:%02d:00', $inMin);
                        $outCarbon = Carbon::parse("{$dateStr} 17:00:00")->subMinutes($lostMins);
                        $timeOut = $outCarbon->format('H:i:s');
                        $renderedHours = round(max(4.5, 8.0 - ($lostMins / 60)), 2);

                        $payload = [
                            'employee_id' => $emp->employee_id,
                            'scanned_by' => 3,
                            'attendance_date' => $dateStr,
                            'time_in' => $timeIn,
                            'lunch_out' => '12:00:00',
                            'lunch_in' => '13:00:00',
                            'time_out' => $timeOut,
                            'total_hours' => $renderedHours,
                            'overtime_hours' => 0.00,
                            'status' => 'Present',
                            'verification_method' => 'QR + Face Recognition',
                            'verified_by_name' => 'Chris Clavite',
                            'remarks' => "Early Logout (Undertime {$lostMins} mins)",
                        ];
                        if ($hasDetailedCols) {
                            $payload['shift_type'] = 'FULL';
                            $payload['late_minutes'] = 0;
                            $payload['undertime_minutes'] = $lostMins;
                        }
                        Attendance::create($payload);
                        $createdCount++;
                        $utIdx++;
                        continue;
                    }

                    if (in_array($dateStr, $lateDates, true)) {
                        $lateMins = $lateOffsetsPool[($lateIdx + $idx) % count($lateOffsetsPool)];
                        $timeIn = Carbon::parse("{$dateStr} 08:00:00")->addMinutes($lateMins)->format('H:i:s');
                        $outSec = ($dayIdx + $idx) % 9;
                        $timeOut = sprintf('17:%02d:00', $outSec);

                        $payload = [
                            'employee_id' => $emp->employee_id,
                            'scanned_by' => 3,
                            'attendance_date' => $dateStr,
                            'time_in' => $timeIn,
                            'lunch_out' => '12:00:00',
                            'lunch_in' => '13:00:00',
                            'time_out' => $timeOut,
                            'total_hours' => 8.00,
                            'overtime_hours' => 0.00,
                            'status' => 'Late',
                            'verification_method' => 'QR + PIN',
                            'verified_by_name' => 'Chris Clavite',
                            'remarks' => "Late Arrival ({$lateMins} mins past 08:00 AM shift)",
                        ];
                        if ($hasDetailedCols) {
                            $payload['shift_type'] = 'FULL';
                            $payload['late_minutes'] = $lateMins;
                            $payload['undertime_minutes'] = 0;
                        }
                        Attendance::create($payload);
                        $createdCount++;
                        $lateIdx++;
                        continue;
                    }

                    // Regular Day Worked (On-Time Full Shift)
                    $inMinute = 44 + (($dayIdx + $idx) % 15); // 07:44 - 07:58
                    $outMinute = ($dayIdx + $idx) % 14;       // 17:00 - 17:13
                    $timeIn = sprintf('07:%02d:00', $inMinute);
                    $timeOut = sprintf('17:%02d:00', $outMinute);

                    $payload = [
                        'employee_id' => $emp->employee_id,
                        'scanned_by' => 3,
                        'attendance_date' => $dateStr,
                        'time_in' => $timeIn,
                        'lunch_out' => '12:00:00',
                        'lunch_in' => '13:00:00',
                        'time_out' => $timeOut,
                        'total_hours' => 8.00,
                        'overtime_hours' => 0.00,
                        'status' => 'Present',
                        'verification_method' => (($dayIdx + $idx) % 2 === 0) ? 'QR + Face Recognition' : 'QR + PIN',
                        'verified_by_name' => 'Chris Clavite',
                        'remarks' => null,
                    ];
                    if ($hasDetailedCols) {
                        $payload['shift_type'] = 'FULL';
                        $payload['late_minutes'] = 0;
                        $payload['undertime_minutes'] = 0;
                    }
                    Attendance::create($payload);
                    $createdCount++;
                }
            }
        });

        if (class_exists(SyncController::class)) {
            SyncController::invalidateFingerprint(['attendance', 'payroll']);
        }

        return [
            'staff_count' => $staffList->count(),
            'scheduled_days' => $totalScheduled,
            'records_created' => $createdCount,
            'records_updated' => $updatedCount,
        ];
    }

    /**
     * Calculate complete attendance metrics per individual Store Admin & Employee
     * across [$startDate, $endDate].
     */
    public static function calculatePeriodMetrics(
        string $startDate = self::DEFAULT_START_DATE,
        string $endDate = self::DEFAULT_END_DATE,
        ?string $branchFilter = null,
        ?string $roleFilter = null,
        $employeeIdFilter = null
    ): array {
        $scheduledDates = self::scheduledDates($startDate, $endDate);
        $scheduledDaysCount = count($scheduledDates);
        $scheduleInfo = AttendanceSchedule::toArray();
        $schedInLabel = $scheduleInfo['labels']['time_in'] ?? '08:00 AM';
        $schedOutLabel = $scheduleInfo['labels']['time_out'] ?? '05:00 PM';

        $staffQuery = self::targetStaffQuery($branchFilter, $roleFilter);
        if ($employeeIdFilter) {
            $staffQuery->where('employee_id', $employeeIdFilter);
        }
        $staffList = $staffQuery->get();

        $empIds = $staffList->pluck('employee_id')->all();
        $recordsByEmp = Attendance::whereIn('employee_id', $empIds)
            ->whereBetween('attendance_date', [$startDate, $endDate])
            ->orderBy('attendance_date')
            ->get()
            ->groupBy('employee_id');

        $staffMetrics = [];
        $totals = [
            'staff_count' => $staffList->count(),
            'scheduled_days_per_staff' => $scheduledDaysCount,
            'total_absences' => 0,
            'total_excused_absences' => 0,
            'total_unexcused_absences' => 0,
            'total_late_frequency' => 0,
            'total_late_minutes' => 0,
            'total_undertime_frequency' => 0,
            'total_undertime_minutes' => 0,
            'total_half_days' => 0,
            'total_regular_full_days' => 0,
            'total_equivalent_days' => 0.0,
        ];

        foreach ($staffList as $emp) {
            $logs = $recordsByEmp->get($emp->employee_id, collect());
            $roleLabel = ($emp->user && in_array($emp->user->role, ['Store Administrator', 'Store Admin'], true)) || strtolower((string) $emp->department) === 'store admin'
                ? 'Store Admin'
                : 'Employee';
            $branchName = $emp->branch_name ?? (is_object($emp->branchProfile) ? $emp->branchProfile->name : ((string) $emp->branch ?: 'Main Branch'));

            $absences = [];
            $excusedCount = 0;
            $unexcusedCount = 0;

            $lates = [];
            $totalLateMins = 0;

            $undertimes = [];
            $totalUndertimeMins = 0;

            $halfDays = [];
            $amHalfDays = 0;
            $pmHalfDays = 0;
            $halfDayHours = 0.0;

            $onTimeFullDays = 0;
            $regularFullDays = 0;
            $totalHoursRendered = 0.0;

            foreach ($logs as $log) {
                $dStr = substr((string) $log->attendance_date, 0, 10);
                $presented = AttendanceSchedule::present($log);
                $shiftType = strtoupper((string) ($log->shift_type ?: ($log->status === 'Half Day' ? 'AM' : ($log->status === 'Absent' ? 'ABSENT' : 'FULL'))));

                if ($log->status === 'Absent') {
                    $reasonCode = $log->reason_code ?: (stripos((string) $log->remarks, 'Vacation') !== false ? 'VL' : (stripos((string) $log->remarks, 'Sick') !== false ? 'SL' : 'AWOL'));
                    $absStatus = $log->absence_status ?: (stripos((string) $log->remarks, 'Excused') !== false ? 'Excused' : 'Unexcused');
                    if (strcasecmp($absStatus, 'Excused') === 0) {
                        $excusedCount++;
                    } else {
                        $unexcusedCount++;
                    }
                    $absences[] = [
                        'date' => $dStr,
                        'reason_code' => $reasonCode,
                        'reason_label' => self::REASON_CODES[$reasonCode]['label'] ?? $reasonCode,
                        'status' => $absStatus,
                        'remarks' => $log->remarks ?: '',
                    ];
                    continue;
                }

                if ($log->status === 'Half Day') {
                    $hmType = in_array($shiftType, ['AM', 'PM'], true) ? $shiftType : (
                        ($log->time_in && strtotime($log->time_in) >= strtotime('12:00:00')) ? 'PM' : 'AM'
                    );
                    if ($hmType === 'AM') {
                        $amHalfDays++;
                    } else {
                        $pmHalfDays++;
                    }
                    $hrs = (float) ($log->total_hours ?: $presented['regular_hours'] ?: 4.0);
                    $halfDayHours += $hrs;
                    $totalHoursRendered += $hrs;
                    $halfDays[] = [
                        'date' => $dStr,
                        'shift_type' => $hmType,
                        'time_in' => $presented['time_in'] ?: ($hmType === 'AM' ? '08:00 AM' : '01:00 PM'),
                        'time_out' => $presented['time_out'] ?: ($hmType === 'AM' ? '12:00 PM' : '05:00 PM'),
                        'hours_rendered' => round($hrs, 2),
                    ];
                    continue;
                }

                // Full shift worked (Present or Late)
                $regularFullDays++;
                $hrs = (float) ($log->total_hours ?: $presented['regular_hours'] ?: 8.0);
                $totalHoursRendered += $hrs;

                $lateMins = (int) ($presented['late_minutes'] ?? 0);
                if ($log->status === 'Late' || $lateMins > 0) {
                    $totalLateMins += $lateMins;
                    $lates[] = [
                        'date' => $dStr,
                        'scheduled_in' => $schedInLabel,
                        'actual_in' => $presented['time_in'] ?: '—',
                        'minutes_late' => $lateMins,
                    ];
                } else {
                    $onTimeFullDays++;
                }

                $utMins = (int) ($presented['undertime_minutes'] ?? 0);
                if ($utMins > 0) {
                    $totalUndertimeMins += $utMins;
                    $undertimes[] = [
                        'date' => $dStr,
                        'scheduled_out' => $schedOutLabel,
                        'actual_out' => $presented['time_out'] ?: '—',
                        'lost_minutes' => $utMins,
                        'hours_rendered' => round($hrs, 2),
                    ];
                }
            }

            $halfDayCount = count($halfDays);
            $equivalentDaysWorked = round($regularFullDays + ($halfDayCount * 0.5), 1);
            $attendanceRate = $scheduledDaysCount > 0
                ? round(($equivalentDaysWorked / $scheduledDaysCount) * 100, 1)
                : 0.0;

            $staffMetrics[] = [
                'employee_id' => $emp->employee_id,
                'employee_code' => $emp->employee_code,
                'employee_name' => trim("{$emp->first_name} {$emp->last_name}"),
                'role' => $roleLabel,
                'department' => $emp->department,
                'position' => $emp->position,
                'branch' => $branchName,
                'branch_id' => $emp->branch_id,
                'scheduled_days' => $scheduledDaysCount,
                'regular_days_worked' => $regularFullDays,
                'on_time_days' => $onTimeFullDays,
                'equivalent_days_worked' => $equivalentDaysWorked,
                'attendance_rate' => $attendanceRate,
                'total_hours_rendered' => round($totalHoursRendered, 2),
                'absences' => [
                    'total' => count($absences),
                    'excused' => $excusedCount,
                    'unexcused' => $unexcusedCount,
                    'records' => $absences,
                ],
                'lates' => [
                    'frequency' => count($lates),
                    'total_minutes' => $totalLateMins,
                    'records' => $lates,
                ],
                'undertime' => [
                    'frequency' => count($undertimes),
                    'total_lost_minutes' => $totalUndertimeMins,
                    'records' => $undertimes,
                ],
                'half_days' => [
                    'count' => $halfDayCount,
                    'am_count' => $amHalfDays,
                    'pm_count' => $pmHalfDays,
                    'total_hours' => round($halfDayHours, 2),
                    'records' => $halfDays,
                ],
            ];

            $totals['total_absences'] += count($absences);
            $totals['total_excused_absences'] += $excusedCount;
            $totals['total_unexcused_absences'] += $unexcusedCount;
            $totals['total_late_frequency'] += count($lates);
            $totals['total_late_minutes'] += $totalLateMins;
            $totals['total_undertime_frequency'] += count($undertimes);
            $totals['total_undertime_minutes'] += $totalUndertimeMins;
            $totals['total_half_days'] += $halfDayCount;
            $totals['total_regular_full_days'] += $regularFullDays;
            $totals['total_equivalent_days'] = round($totals['total_equivalent_days'] + $equivalentDaysWorked, 1);
        }

        return [
            'period' => [
                'start_date' => $startDate,
                'end_date' => $endDate,
                'label' => date('M d, Y', strtotime($startDate)) . ' to ' . date('M d, Y', strtotime($endDate)),
                'scheduled_days' => $scheduledDaysCount,
                'scheduled_shift' => "{$schedInLabel} – {$schedOutLabel} (Mon–Sat)",
            ],
            'totals' => $totals,
            'staff' => $staffMetrics,
        ];
    }
}
