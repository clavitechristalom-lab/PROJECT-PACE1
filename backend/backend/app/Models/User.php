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
        'username',
        'password_hash',
        'role',
        'is_active',
        'account_verified',
        'account_verified_at',
        'account_verified_by',
        'last_login',
        'user_id',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'account_verified' => 'boolean',
        'account_verified_at' => 'datetime',
        'last_login' => 'datetime',
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
