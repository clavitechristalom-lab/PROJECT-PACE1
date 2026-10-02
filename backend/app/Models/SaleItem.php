<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class SaleItem extends Model
{
    protected $primaryKey = 'sale_item_id';
    protected $table = 'sale_items';
    public $timestamps = false; // As per your SQL, this only has a "created_at" timestamp

    protected $fillable = [
        'sale_id', 'product_id', 'quantity', 'unit_price', 
        'discount_amount', 'line_total'
    ];

    // Relationships
    public function saleTransaction()
    {
        return $this->belongsTo(SaleTransaction::class, 'sale_id', 'sale_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id', 'product_id');
    }
}