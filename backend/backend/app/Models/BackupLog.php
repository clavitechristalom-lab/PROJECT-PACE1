<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class BackupLog extends Model
{
    protected $primaryKey = 'id';
    protected $table = 'backup_logs';
    public $timestamps = true;

    protected $fillable = [
        'backup_name', 'file_path', 'backup_type', 'file_size', 
        'status', 'started_at', 'completed_at', 'created_by', 'notes'
    ];

    protected $appends = ['backup_id'];

    public function getBackupIdAttribute()
    {
        return $this->id;
    }

    // Relationships
    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }
}