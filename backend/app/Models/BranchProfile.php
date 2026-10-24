<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BranchProfile extends Model
{
    protected $fillable = [
        'name',
        'location',
        'manager_id',
        'contact_number',
        'status',
        'color',
        'image_url',
    ];

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id', 'user_id');
    }

    public function employees()
    {
        return $this->hasMany(Employee::class, 'branch_id', 'id');
    }

    public function customers()
    {
        return $this->hasMany(Customer::class, 'branch_id', 'id');
    }

    public function sales()
    {
        return $this->hasMany(SaleTransaction::class, 'branch_id', 'id');
    }

    public function products()
    {
        return $this->hasMany(Product::class, 'branch_id', 'id');
    }

    public function reports()
    {
        return $this->hasMany(Report::class, 'branch_id', 'id');
    }

    public static function getNameById($id)
    {
        if (empty($id)) return null;
        static $memoryCache = [];
        if (isset($memoryCache[$id])) {
            return $memoryCache[$id];
        }
        $name = \Illuminate\Support\Facades\Cache::remember("branch_name_{$id}", 3600, function () use ($id) {
            $bp = self::find($id);
            return $bp ? $bp->name : null;
        });
        $memoryCache[$id] = $name;
        return $name;
    }

    protected static function booted()
    {
        static::saved(function ($branch) {
            \Illuminate\Support\Facades\Cache::forget("branch_name_{$branch->id}");
        });
        static::deleted(function ($branch) {
            \Illuminate\Support\Facades\Cache::forget("branch_name_{$branch->id}");
        });
    }
}
