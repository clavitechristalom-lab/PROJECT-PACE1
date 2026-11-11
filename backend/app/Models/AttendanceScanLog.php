<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceScanLog extends Model
{
    protected $table = 'attendance_scan_logs';
    protected $primaryKey = 'id';

    protected $fillable = [
        'employee_id',
        'scanned_by',
        'branch',
        'qr_token_scanned',
        'scan_time',
        'qr_verified',
        'pin_verified',
        'action_type',
        'status',
        'failure_reason',
        'device_info',
        'ip_address',
    ];

    protected $casts = [
        'qr_verified' => 'boolean',
        'pin_verified' => 'boolean',
        'scan_time' => 'datetime',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    public function scannedBy()
    {
        return $this->belongsTo(User::class, 'scanned_by', 'user_id');
    }

    /**
     * Preload attendance records keyed by "{employee_id}_{YYYY-MM-DD}" for a collection of scan logs.
     */
    public static function batchAttendanceMap($logs)
    {
        $empIds = collect($logs)->pluck('employee_id')->filter()->unique()->values();
        if ($empIds->isEmpty()) {
            return collect();
        }

        return Attendance::whereIn('employee_id', $empIds)
            ->get(['employee_id', 'attendance_date', 'qr_scan_in', 'qr_scan_out', 'verification_method'])
            ->keyBy(fn($a) => $a->employee_id . '_' . substr((string)$a->attendance_date, 0, 10));
    }

    /**
     * Resolve exact verification method & face_verified flag for a scan log entry.
     */
    public static function resolveVerificationMeta($log, $attMap): array
    {
        $reasonLower = strtolower((string)($log->failure_reason ?? ''));
        if ($log->action_type === 'FACE_VERIFICATION_FAILED' || ($log->status === 'FAILED' && str_contains($reasonLower, 'face'))) {
            return ['verification_method' => 'Face Failed', 'face_verified' => false];
        }

        if ($log->status === 'SUCCESS' && $log->qr_verified) {
            $scanDate = $log->scan_time ? $log->scan_time->format('Y-m-d') : ($log->created_at ? $log->created_at->format('Y-m-d') : null);
            $att = ($log->employee_id && $scanDate) ? $attMap->get($log->employee_id . '_' . $scanDate) : null;

            $isFace = false;
            if ($att) {
                $attMethod = (string)($att->verification_method ?? '');
                if ($log->action_type === 'ATTENDANCE_TIME_IN') {
                    $isFace = $att->qr_scan_in === 'QR_FACE_VERIFIED' || (empty($att->qr_scan_in) && stripos($attMethod, 'Face Recognition') !== false);
                } elseif ($log->action_type === 'ATTENDANCE_TIME_OUT') {
                    $isFace = $att->qr_scan_out === 'QR_FACE_VERIFIED' || (empty($att->qr_scan_out) && stripos($attMethod, 'Face Recognition') !== false);
                } else {
                    $isFace = $att->qr_scan_in === 'QR_FACE_VERIFIED'
                        || $att->qr_scan_out === 'QR_FACE_VERIFIED'
                        || stripos($attMethod, 'Face Recognition') !== false;
                }
            } elseif (in_array($log->action_type, ['FACE_RECOGNITION', 'FACE_VERIFICATION'], true)) {
                $isFace = true;
            }

            if ($isFace) {
                return ['verification_method' => 'QR + Face Recognition', 'face_verified' => true];
            }
            if ($log->pin_verified) {
                return ['verification_method' => 'QR + PIN', 'face_verified' => false];
            }
        }

        if ($log->qr_verified) {
            return ['verification_method' => 'QR Only', 'face_verified' => false];
        }

        return ['verification_method' => 'Failed', 'face_verified' => false];
    }
}
