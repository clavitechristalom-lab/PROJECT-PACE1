<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $primaryKey = 'product_id';
    protected $table = 'products';

    protected $fillable = [
        'branch_id', 'product_code', 'product_name', 'category', 'brand', 'description', 
        'unit_price', 'cost_price', 'stock_quantity', 'reorder_level', 
        'unit', 'status', 'image_url'
    ];

    // Relationships
    public function saleItems()
    {
        return $this->hasMany(SaleItem::class, 'product_id', 'product_id');
    }

    public function branch()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }
}