<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    protected $primaryKey = 'employee_id';
    protected $table = 'employees';

    protected $fillable = [
        'employee_code', 'first_name', 'middle_name', 'last_name', 'gender',
        'birth_date', 'date_of_birth', 'marital_status', 'tin_number', 'sss_number', 
        'philhealth_number', 'pagibig_number', 'position', 'department', 'branch_id',
        'pay_type', 'ewallet_provider', 'ewallet_account_no', 'bank_name', 'bank_account_no',
        'basic_salary', 'daily_rate', 'hourly_rate', 'phone', 'email', 
        'address', 'hire_date', 'working_hours', 'emergency_contact_name', 
        'emergency_contact_relation', 'emergency_contact_phone', 'documents',
        'qr_code', 'qr_token', 'qr_active', 'qr_generated_at', 'attendance_pin',
        'pin_failed_attempts', 'pin_locked_until', 'status', 'information_verified',
        'information_verified_at', 'account_verified', 'account_verified_at',
        'notes'
    ];

    protected $hidden = [
        'attendance_pin',
    ];

    protected $casts = [
        'qr_active' => 'boolean',
        'qr_generated_at' => 'datetime',
        'pin_locked_until' => 'datetime',
        'information_verified' => 'boolean',
        'information_verified_at' => 'datetime',
        'account_verified' => 'boolean',
        'account_verified_at' => 'datetime',
    ];

    public function getIsVerifiedAttribute()
    {
        return (bool)($this->account_verified || $this->information_verified);
    }

    protected static function booted()
    {
        static::creating(function ($employee) {
            if (empty($employee->attendance_pin)) {
                $employee->attendance_pin = \Illuminate\Support\Facades\Hash::make('1234');
            }
        });
    }

    public function user()
    {
        return $this->hasOne(User::class, 'employee_id', 'employee_id');
    }

    public function qrRequests()
    {
        return $this->hasMany(QrRequest::class, 'employee_id', 'employee_id');
    }

    // qr_issued_by column does not exist in the database schema

    public function attendances()
    {
        return $this->hasMany(Attendance::class, 'employee_id', 'employee_id');
    }

    public function branch()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }

    public function payrolls()
    {
        return $this->hasMany(Payroll::class, 'employee_id', 'employee_id');
    }

    public function scanLogs()
    {
        return $this->hasMany(AttendanceScanLog::class, 'employee_id', 'employee_id');
    }
}