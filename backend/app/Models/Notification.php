<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $table = 'notifications';

    protected $primaryKey = 'notification_id';

    public $incrementing = true;

    protected $keyType = 'int';

    protected $fillable = [
        'user_id',
        'type',
        'title',
        'message',
        'module',
        'related_id',
        'related_type',
        'action_url',
        'priority',
        'is_read',
        'read_at',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'read_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Notification recipient user.
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    /**
     * Scope for a specific user.
     */
    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    /**
     * Scope for unread notifications.
     */
    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    /**
     * Scope for read notifications.
     */
    public function scopeRead($query)
    {
        return $query->where('is_read', true);
    }

    /**
     * Scope by module.
     */
    public function scopeByModule($query, $module)
    {
        if ($module && $module !== 'All') {
            return $query->where('module', $module);
        }
        return $query;
    }

    /**
     * Scope by priority.
     */
    public function scopeByPriority($query, $priority)
    {
        if ($priority && $priority !== 'All') {
            return $query->where('priority', strtolower($priority));
        }
        return $query;
    }
}
