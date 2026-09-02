<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $primaryKey = 'product_id';
    protected $table = 'products';

    protected $fillable = [
        'product_code', 'product_name', 'category', 'brand', 'description', 
        'unit_price', 'cost_price', 'stock_quantity', 'reorder_level', 
        'unit', 'status'
    ];

    // Relationships
    public function saleItems()
    {
        return $this->hasMany(SaleItem::class, 'product_id', 'product_id');
    }
}