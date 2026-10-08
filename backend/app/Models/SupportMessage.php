<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportMessage extends Model
{
    protected $fillable = ['customer_id', 'topic', 'message', 'status', 'response', 'responded_by', 'responded_at', 'customer_reply', 'customer_reply_at', 'admin_followup_response', 'admin_followup_at', 'chat_history'];

    protected $casts = [
        'chat_history' => 'array',
        'responded_at' => 'datetime',
        'customer_reply_at' => 'datetime',
        'admin_followup_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function respondedBy()
    {
        return $this->belongsTo(User::class, 'responded_by', 'user_id');
    }
}
