<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use App\Services\CategoryFramework;

class Product extends Model
{
    protected $primaryKey = 'product_id';
    protected $table = 'products';

    protected $fillable = [
        'branch_id', 'product_code', 'product_name', 'category', 'brand', 'description', 
        'unit_price', 'discount_price', 'cost_price', 'stock_quantity', 'reorder_level', 
        'unit', 'length', 'width', 'height', 'dimension_unit', 'weight', 'weight_unit',
        'status', 'image_url', 'image_url_2', 'image_url_3', 'image_url_4'
    ];

    protected $appends = ['main_category', 'category_group', 'category_subcategory'];

    public function getMainCategoryAttribute(): ?string
    {
        return CategoryFramework::resolveHierarchy($this->category)['main_category'];
    }

    public function getCategoryGroupAttribute(): ?string
    {
        return CategoryFramework::resolveHierarchy($this->category)['category_group'];
    }

    public function getCategorySubcategoryAttribute(): ?string
    {
        return CategoryFramework::resolveHierarchy($this->category)['subcategory'];
    }

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