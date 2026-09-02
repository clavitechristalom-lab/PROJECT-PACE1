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
}
