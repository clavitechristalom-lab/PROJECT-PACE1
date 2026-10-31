<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

class EmployeeLetter extends Model
{
    protected $table = 'employee_letters';
    protected $primaryKey = 'letter_id';

    protected $fillable = [
        'employee_id',
        'user_id',
        'category',
        'leave_type',
        'title',
        'start_date',
        'end_date',
        'reason',
        'letter_body',
        'attachment_path',
        'attachment_name',
        'status',
        'reviewed_by',
        'reviewed_at',
        'admin_remarks',
        'is_read',
        'read_at',
        'is_archived',
        'archived_at',
        'archived_by',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'reviewed_at' => 'datetime',
        'read_at' => 'datetime',
        'archived_at' => 'datetime',
        'is_read' => 'boolean',
        'is_archived' => 'boolean',
    ];

    protected $appends = [
        'attachment_url',
        'total_days',
        'employee_name',
        'is_past_24_hours',
        'leave_type_label',
        'is_paid',
    ];

    public function getLeaveTypeLabelAttribute(): string
    {
        $raw = strtolower(trim($this->leave_type ?? 'without_pay'));
        return in_array($raw, ['with_pay', 'leave with pay', 'paid'], true)
            ? 'Leave with Pay'
            : 'Leave without Pay';
    }

    public function getIsPaidAttribute(): bool
    {
        $raw = strtolower(trim($this->leave_type ?? 'without_pay'));
        return in_array($raw, ['with_pay', 'leave with pay', 'paid'], true);
    }

    /**
     * Determine if letter is older than 24 hours (from review or creation).
     */
    public function getIsPast24HoursAttribute(): bool
    {
        $refTime = $this->reviewed_at ?: $this->created_at;
        return $refTime ? Carbon::parse($refTime)->addHours(24)->isPast() : false;
    }

    /**
     * Automatically archive letters older than 24 hours.
     */
    public static function autoArchiveOldLetters(): int
    {
        $cutoff = Carbon::now()->subHours(24);
        return self::where('is_archived', false)
            ->where(function ($q) use ($cutoff) {
                $q->where(function ($sub) use ($cutoff) {
                    $sub->whereNotNull('reviewed_at')
                        ->where('reviewed_at', '<=', $cutoff);
                })->orWhere(function ($sub) use ($cutoff) {
                    $sub->whereIn('status', ['Approved', 'Rejected'])
                        ->where('updated_at', '<=', $cutoff);
                })->orWhere('created_at', '<=', $cutoff);
            })
            ->update([
                'is_archived' => true,
                'archived_at' => Carbon::now(),
            ]);
    }

    // Relationships
    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by', 'user_id');
    }

    // Accessors
    public function getAttachmentUrlAttribute()
    {
        if (empty($this->attachment_path)) {
            return null;
        }

        if (str_starts_with($this->attachment_path, 'http://') || str_starts_with($this->attachment_path, 'https://')) {
            return $this->attachment_path;
        }

        return url('/' . ltrim($this->attachment_path, '/'));
    }

    public function getTotalDaysAttribute()
    {
        if (!$this->start_date || !$this->end_date) {
            return 1;
        }

        try {
            $start = Carbon::parse($this->start_date);
            $end = Carbon::parse($this->end_date);
            if ($end->lt($start)) {
                return 1;
            }
            // Count active working days (Mon - Sat, excluding Sun)
            $curr = $start->copy();
            $days = 0;
            while ($curr->lte($end)) {
                if (!$curr->isSunday()) {
                    $days++;
                }
                $curr->addDay();
            }
            return max(1, $days);
        } catch (\Throwable $e) {
            return 1;
        }
    }

    public function getEmployeeNameAttribute()
    {
        if ($this->relationLoaded('employee') && $this->employee) {
            return trim("{$this->employee->first_name} {$this->employee->last_name}");
        }
        return 'Employee #' . $this->employee_id;
    }
}
