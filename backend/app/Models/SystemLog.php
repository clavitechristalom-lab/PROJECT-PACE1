<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class SystemLog extends Model
{
    protected $primaryKey = 'id';
    protected $table = 'system_logs';
    public $timestamps = true;

    protected $fillable = [
        'user_id', 'action', 'module', 'description', 
        'ip_address', 'user_agent'
    ];

    protected $appends = ['log_id'];

    public function getLogIdAttribute()
    {
        return $this->id;
    }

    protected static function booted()
    {
        static::creating(function ($log) {
            $authUser = auth()->user() ?? auth('sanctum')->user() ?? request()?->user();

            // If user_id is empty/null, try to resolve from current authenticated user
            if (empty($log->user_id)) {
                $log->user_id = ($authUser instanceof \App\Models\User) ? $authUser->user_id : null;
            }

            // Verify user_id exists in users table to prevent FK constraint failures
            if (!empty($log->user_id)) {
                if ($authUser instanceof \App\Models\User && $authUser->user_id == $log->user_id) {
                    // Authenticated user instance is already validated from database
                    return;
                }

                static $validUserIds = [];
                if (!isset($validUserIds[$log->user_id])) {
                    $validUserIds[$log->user_id] = \App\Models\User::where('user_id', $log->user_id)->exists();
                }

                if (!$validUserIds[$log->user_id]) {
                    $log->user_id = ($authUser instanceof \App\Models\User) ? $authUser->user_id : null;
                }
            }
        });
    }

    // Relationships
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }
}