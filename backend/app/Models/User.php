<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
    protected $table = 'users';

    protected $primaryKey = 'user_id';

    public $incrementing = true;

    protected $keyType = 'int';

    protected $fillable = [
        'employee_id',
        'customer_id',
        'username',
        'email',
        'phone_number',
        'password_hash',
        'role',
        'is_active',
        'account_verified',
        'account_verified_at',
        'account_verified_by',
        'last_login',
        'otp_code',
        'otp_expires_at',
        'otp_created_at',
        'profile_image',
        'face_biometric_image',
        'user_id',
    ];

    protected $hidden = [
        'password_hash',
        'otp_code',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'account_verified' => 'boolean',
        'account_verified_at' => 'datetime',
        'last_login' => 'datetime',
        'otp_expires_at' => 'datetime',
        'otp_created_at' => 'datetime',
    ];

    /**
     * Use username instead of email for authentication.
     */
    public function getAuthPasswordName()
    {
        return 'password_hash';
    }

    public function getAuthPassword()
    {
        return $this->password_hash;
    }

    /**
     * Relationship with employee.
     */
    public function employee()
    {
        return $this->belongsTo(
            Employee::class,
            'employee_id',
            'employee_id'
        );
    }

    /**
     * Relationship with customer.
     */
    public function customer()
    {
        return $this->belongsTo(
            Customer::class,
            'customer_id',
            'customer_id'
        );
    }

    /**
     * Administrator who verified the account.
     */
    public function verifiedBy()
    {
        return $this->belongsTo(
            User::class,
            'account_verified_by',
            'user_id'
        );
    }

    /**
     * Sales processed by this user.
     */
    public function processedSales()
    {
        return $this->hasMany(
            SaleTransaction::class,
            'processed_by',
            'user_id'
        );
    }

    public function qrRequests()
    {
        return $this->hasMany(
            QrRequest::class,
            'user_id',
            'user_id'
        );
    }
}
