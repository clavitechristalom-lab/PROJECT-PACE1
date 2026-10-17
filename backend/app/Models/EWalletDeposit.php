<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EWalletDeposit extends Model
{
    protected $table = 'e_wallet_deposits';
    protected $primaryKey = 'deposit_id';

    protected $fillable = [
        'transaction_reference',
        'customer_reference',
        'customer_id',
        'user_id',
        'installment_id',
        'schedule_id',
        'payment_method',
        'payment_type',
        'amount',
        'fee',
        'currency',
        'status',
        'checkout_url',
        'checkout_session_id',
        'qr_code_data',
        'paid_at',
        'proof_of_payment',
        'gateway_response',
        'webhook_payload',
        'payment_id',
    ];

    protected $casts = [
        'gateway_response' => 'array',
        'webhook_payload' => 'array',
        'paid_at' => 'datetime',
        'amount' => 'float',
        'fee' => 'float',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function installmentAccount()
    {
        return $this->belongsTo(InstallmentAccount::class, 'installment_id', 'installment_id');
    }

    public function paymentSchedule()
    {
        return $this->belongsTo(PaymentSchedule::class, 'schedule_id', 'schedule_id');
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class, 'payment_id', 'payment_id');
    }
}
