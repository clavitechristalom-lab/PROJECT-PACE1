<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    protected $primaryKey = 'attendance_id';
    protected $table = 'attendance';

    protected $fillable = [
        'employee_id',
        'scanned_by',
        'attendance_date',
        'time_in',
        'break_out',
        'break_in',
        'lunch_out',
        'lunch_in',
        'time_out', 
        'total_hours',
        'overtime_hours',
        'status',
        'qr_scan_in', 
        'qr_scan_out',
        'verification_method',
        'verified_by_name',
        'device_info',
        'ip_address',
        'remarks',
    ];

    protected $casts = [
        'total_hours' => 'decimal:2',
        'overtime_hours' => 'decimal:2',
    ];

    // Relationships
    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    public function scannedBy()
    {
        return $this->belongsTo(User::class, 'scanned_by', 'user_id');
    }
}