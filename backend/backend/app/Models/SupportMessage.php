<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportMessage extends Model
{
    protected $fillable = ['customer_id', 'topic', 'message', 'status', 'response', 'responded_by', 'responded_at', 'customer_reply', 'customer_reply_at'];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }
}
