<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    const POSITION_MANAGER = 'Manager (Store Admin)';
    const POSITION_CASHIER = 'Cashier (Employee)';
    const POSITION_COLLECTOR = 'Collector (Employee)';
    const POSITION_UTILITY = 'Utility (Employee)';

    public static function getValidPositions(): array
    {
        return [
            self::POSITION_MANAGER,
            self::POSITION_CASHIER,
            self::POSITION_COLLECTOR,
            self::POSITION_UTILITY,
        ];
    }

    protected $primaryKey = 'employee_id';
    protected $table = 'employees';

    protected $fillable = [
        'employee_code', 'first_name', 'middle_name', 'last_name', 'gender',
        'birth_date', 'date_of_birth', 'marital_status', 'tin_number', 'sss_number', 
        'philhealth_number', 'pagibig_number', 'position', 'department', 'branch_id', 'branch',
        'pay_type', 'ewallet_provider', 'ewallet_account_name', 'ewallet_account_no', 'bank_name', 'bank_account_name', 'bank_account_no',
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

    protected $appends = [
        'is_verified',
        'branch_name',
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

    public function getPositionAttribute($value)
    {
        if ($value === 'Staff' || empty($value)) {
            return ($this->department === 'Store Admin') ? self::POSITION_MANAGER : self::POSITION_CASHIER;
        }
        if ($value === 'Store Administrator') {
            return self::POSITION_MANAGER;
        }
        return $value;
    }

    protected static function booted()
    {
        static::creating(function ($employee) {
            // Removing the default 1234 fallback so employees must set it themselves
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

    public function payslips()
    {
        return $this->hasMany(Payslip::class, 'employee_id', 'employee_id');
    }

    public function branch()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }

    public function branchProfile()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }

    public function getBranchNameAttribute()
    {
        if ($this->relationLoaded('branch') && $this->getRelation('branch') instanceof BranchProfile) {
            return $this->getRelation('branch')->name;
        }
        if ($this->relationLoaded('branchProfile') && $this->getRelation('branchProfile') instanceof BranchProfile) {
            return $this->getRelation('branchProfile')->name;
        }
        if (!empty($this->attributes['branch'])) {
            return (string)$this->attributes['branch'];
        }
        if (!empty($this->branch_id)) {
            return BranchProfile::getNameById($this->branch_id);
        }
        return null;
    }

    public function payrolls()
    {
        return $this->hasMany(Payroll::class, 'employee_id', 'employee_id');
    }

    public function scanLogs()
    {
        return $this->hasMany(AttendanceScanLog::class, 'employee_id', 'employee_id');
    }

    public function allowances()
    {
        return $this->hasMany(EmployeeAllowance::class, 'employee_id', 'employee_id');
    }

    public function bonuses()
    {
        return $this->hasMany(EmployeeBonus::class, 'employee_id', 'employee_id');
    }

    public function deductions()
    {
        return $this->hasMany(EmployeeDeduction::class, 'employee_id', 'employee_id');
    }

    public function loans()
    {
        return $this->hasMany(EmployeeLoan::class, 'employee_id', 'employee_id');
    }

    public function letters()
    {
        return $this->hasMany(EmployeeLetter::class, 'employee_id', 'employee_id');
    }

    public function employeeLetters()
    {
        return $this->hasMany(EmployeeLetter::class, 'employee_id', 'employee_id');
    }

    public function supportMessages()
    {
        return $this->hasMany(SupportMessage::class, 'employee_id', 'employee_id');
    }

    public function processedSales()
    {
        return $this->hasManyThrough(
            SaleTransaction::class,
            User::class,
            'employee_id',
            'processed_by',
            'employee_id',
            'user_id'
        );
    }

    public function receivedPayments()
    {
        return $this->hasManyThrough(
            Payment::class,
            User::class,
            'employee_id',
            'received_by',
            'employee_id',
            'user_id'
        );
    }

    /**
     * Scope query to strictly include Store Administrator and Employee staff only.
     * Excludes Administrators (System Admin, Main Admin) and Customers from payroll.
     */
    public function scopePayrollEligible($query)
    {
        return $query->whereHas('user', function ($uq) {
                $uq->whereIn('role', ['Store Administrator', 'Store Admin', 'Employee', 'Staff']);
            })
            ->where(function ($ex) {
                $ex->where('position', 'NOT LIKE', '%System Administrator%')
                   ->where('position', 'NOT LIKE', '%Main Administrator%')
                   ->where('position', '!=', 'Administrator')
                   ->orWhereNull('position');
            });
    }
}