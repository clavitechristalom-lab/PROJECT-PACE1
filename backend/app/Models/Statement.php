<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Statement extends Model
{
    use HasFactory;

    protected $table = 'statements';
    protected $primaryKey = 'id';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'customer_id',
        'statement_number',
        'start_date',
        'end_date',
        'opening_balance',
        'total_charges',
        'total_payments',
        'closing_balance',
        'due_date',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'start_date'      => 'date',
        'end_date'        => 'date',
        'due_date'        => 'date',
        'opening_balance' => 'decimal:2',
        'total_charges'   => 'decimal:2',
        'total_payments'  => 'decimal:2',
        'closing_balance' => 'decimal:2',
    ];

    /**
     * Bootstrap model events.
     */
    protected static function booted()
    {
        static::creating(function ($statement) {
            // Auto-generate unique statement number if not provided
            if (empty($statement->statement_number)) {
                $statement->statement_number = self::generateStatementNumber();
            }
        });

        static::saving(function ($statement) {
            // Auto-calculate closing_balance if not explicitly provided
            if ($statement->closing_balance === null || $statement->closing_balance === '') {
                $opening = (float)($statement->opening_balance ?? 0);
                $charges = (float)($statement->total_charges ?? 0);
                $payments = (float)($statement->total_payments ?? 0);
                $statement->closing_balance = round($opening + $charges - $payments, 2);
            }
        });
    }

    /**
     * Helper to generate a unique statement number.
     */
    public static function generateStatementNumber(): string
    {
        $prefix = 'SOA-' . date('Ym') . '-';
        $maxAttempts = 10;
        
        for ($i = 0; $i < $maxAttempts; $i++) {
            $candidate = $prefix . str_pad((string)mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);
            if (!self::where('statement_number', $candidate)->exists()) {
                return $candidate;
            }
        }

        return $prefix . strtoupper(substr(uniqid(), -4));
    }

    /**
     * Get the customer that owns the statement.
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    /**
     * Scope a query to filter statements for a specific customer.
     */
    public function scopeForCustomer($query, $customerId)
    {
        return $query->where('customer_id', $customerId);
    }
}

