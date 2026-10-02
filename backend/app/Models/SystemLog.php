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

    // Relationships
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }
}