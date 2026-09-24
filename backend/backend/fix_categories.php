<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Product;

$products = Product::all();

foreach ($products as $p) {
    $name = strtolower($p->product_name);
    
    $isFurniture = str_contains($name, 'sofa') || str_contains($name, 'bed') || str_contains($name, 'chair') || str_contains($name, 'table') || str_contains($name, 'cabinet') || str_contains($name, 'dining') || str_contains($name, 'wardrobe');
    
    $isAppliance = str_contains($name, 'tv') || str_contains($name, 'television') || str_contains($name, 'refrigerator') || str_contains($name, 'fridge') || str_contains($name, 'aircon') || str_contains($name, 'washing') || str_contains($name, 'fan') || str_contains($name, 'oven') || str_contains($name, 'microwave');
    
    if ($isFurniture && strtolower($p->category) !== 'furniture') {
        echo "Updating {$p->product_name} from {$p->category} to Furniture\n";
        $p->category = 'Furniture';
        $p->save();
    } elseif ($isAppliance && strtolower($p->category) !== 'appliances') {
        echo "Updating {$p->product_name} from {$p->category} to Appliances\n";
        $p->category = 'Appliances';
        $p->save();
    }
}
echo "Done.\n";
