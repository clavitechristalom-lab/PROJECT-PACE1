<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportMessage extends Model
{
    public const VALID_LETTER_CATEGORIES = [
        'Excuse Letter',
        'Sick Leave',
        'Important Matter',
        'Maternity Leave',
        'Vacation Leave',
    ];

    protected $fillable = [
        'customer_id',
        'employee_id',
        'branch_id',
        'message_type',
        'category',
        'from_date',
        'to_date',
        'total_days',
        'reason',
        'topic',
        'message',
        'attachment_path',
        'status',
        'is_read',
        'response',
        'responded_by',
        'responded_at',
        'reviewed_by',
        'reviewed_at',
        'admin_remarks',
        'customer_reply',
        'customer_reply_at',
        'admin_followup_response',
        'admin_followup_at',
        'chat_history',
    ];

    protected $casts = [
        'chat_history' => 'array',
        'is_read' => 'boolean',
        'from_date' => 'date:Y-m-d',
        'to_date' => 'date:Y-m-d',
        'total_days' => 'integer',
        'responded_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'customer_reply_at' => 'datetime',
        'admin_followup_at' => 'datetime',
    ];

    protected $appends = ['attachment_url', 'total_days'];

    public function getTotalDaysAttribute($value): int
    {
        if (!empty($value) && (int)$value > 0) {
            return (int)$value;
        }
        if (!empty($this->from_date) && !empty($this->to_date)) {
            $from = \Carbon\Carbon::parse($this->from_date);
            $to = \Carbon\Carbon::parse($this->to_date);
            return max(1, $from->diffInDays($to) + 1);
        }
        return 1;
    }

    public function getAttachmentUrlAttribute(): ?string
    {
        if (empty($this->attachment_path)) {
            return null;
        }
        return str_starts_with($this->attachment_path, 'http')
            ? $this->attachment_path
            : url('storage/' . $this->attachment_path);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    public function branch()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }

    public function respondedBy()
    {
        return $this->belongsTo(User::class, 'responded_by', 'user_id');
    }

    public function reviewedBy()
    {
        return $this->belongsTo(User::class, 'reviewed_by', 'user_id');
    }
}
