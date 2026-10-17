<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Product;

class CatalogProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            // ─── FURNITURE CATEGORY ───
            [
                'product_code' => 'FUR-SOF-001',
                'product_name' => 'Nordic 3-Seater Fabric Sofa',
                'category' => 'Furniture',
                'brand' => 'ScandiLiving',
                'description' => 'Premium high-resilience foam cushioning, solid mahogany internal frame, stain-resistant woven polyester upholstery in Slate Grey.',
                'unit_price' => 19500.00,
                'discount_price' => 17999.00,
                'cost_price' => 12000.00,
                'stock_quantity' => 12,
                'reorder_level' => 3,
                'unit' => 'pc',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80',
            ],
            [
                'product_code' => 'FUR-DIN-002',
                'product_name' => 'Solid Oak 6-Seater Dining Set',
                'category' => 'Furniture',
                'brand' => 'HomeCraft',
                'description' => 'Handcrafted solid Malaysian oak dining table (160x90cm) with water-repellent walnut finish, includes 6 ergonomically cushioned chairs.',
                'unit_price' => 26500.00,
                'discount_price' => 24900.00,
                'cost_price' => 16500.00,
                'stock_quantity' => 8,
                'reorder_level' => 2,
                'unit' => 'set',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=600&q=80',
            ],
            [
                'product_code' => 'FUR-CHR-003',
                'product_name' => 'Ergonomic Executive Office Chair',
                'category' => 'Furniture',
                'brand' => 'ErgoPro',
                'description' => 'Breathable dual-mesh backrest, adjustable 3D lumbar support, multi-lock recline up to 135°, class-4 heavy-duty gas cylinder.',
                'unit_price' => 7499.00,
                'discount_price' => 6799.00,
                'cost_price' => 4200.00,
                'stock_quantity' => 20,
                'reorder_level' => 5,
                'unit' => 'pc',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1580481077195-c9a008c352a1?auto=format&fit=crop&w=600&q=80',
            ],
            [
                'product_code' => 'FUR-BED-004',
                'product_name' => 'Queen Storage Hydraulic Bed Frame',
                'category' => 'Furniture',
                'brand' => 'SleepEase',
                'description' => 'Queen-size (60x78 in) upholstered bed frame with gas-lift underbed hydraulic storage chamber, reinforced steel slatted mattress foundation.',
                'unit_price' => 23800.00,
                'discount_price' => 21999.00,
                'cost_price' => 14000.00,
                'stock_quantity' => 6,
                'reorder_level' => 2,
                'unit' => 'unit',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=600&q=80',
            ],

            // ─── APPLIANCES CATEGORY ───
            [
                'product_code' => 'APP-REF-001',
                'product_name' => 'Inverter 2-Door No-Frost Refrigerator 10.5 cu ft',
                'category' => 'Appliances',
                'brand' => 'Panasonic',
                'description' => 'Econavi smart sensors, Ag Clean 99.9% antibacterial deodorizer, quick freezing compartment, energy rating 5-Star (saves up to 45% power).',
                'unit_price' => 31999.00,
                'discount_price' => 29499.00,
                'cost_price' => 22000.00,
                'stock_quantity' => 9,
                'reorder_level' => 2,
                'unit' => 'unit',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80',
            ],
            [
                'product_code' => 'APP-WSH-002',
                'product_name' => 'Front-Load Inverter Washing Machine 9.0 kg',
                'category' => 'Appliances',
                'brand' => 'LG Electronics',
                'description' => 'AI Direct Drive motor with 6 Motion DD technology, Steam allergy care program, TurboWash 59-min quick cycle, Wi-Fi ThinQ mobile control.',
                'unit_price' => 28500.00,
                'discount_price' => 26900.00,
                'cost_price' => 18000.00,
                'stock_quantity' => 11,
                'reorder_level' => 3,
                'unit' => 'unit',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=600&q=80',
            ],
            [
                'product_code' => 'APP-AC-003',
                'product_name' => 'Inverter Split Air Conditioner 1.5 HP',
                'category' => 'Appliances',
                'brand' => 'Carrier',
                'description' => 'Full DC Inverter cooling system, Dual Filtration PM2.5 air purifier, Gold Fin anti-corrosive coating, ultra-quiet 21dB sleep mode.',
                'unit_price' => 33500.00,
                'discount_price' => 31200.00,
                'cost_price' => 23000.00,
                'stock_quantity' => 7,
                'reorder_level' => 2,
                'unit' => 'set',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1631545306915-d368d400e9ec?auto=format&fit=crop&w=600&q=80',
            ],
            [
                'product_code' => 'APP-TV-004',
                'product_name' => '55" 4K UHD Smart Google TV',
                'category' => 'Appliances',
                'brand' => 'Samsung',
                'description' => 'Crystal Processor 4K, HDR10+ Dynamic Color, Dolby Audio 20W, Google TV with voice remote, built-in Chromecast, 3x HDMI, 2x USB.',
                'unit_price' => 25990.00,
                'discount_price' => 23990.00,
                'cost_price' => 17000.00,
                'stock_quantity' => 14,
                'reorder_level' => 3,
                'unit' => 'unit',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=80',
            ],
            [
                'product_code' => 'APP-FRY-005',
                'product_name' => 'Digital Touch Air Fryer & Rotisserie Oven 12L',
                'category' => 'Appliances',
                'brand' => 'Philips',
                'description' => 'Rapid Air 360° technology, 16 one-touch smart cooking presets, dehydrator function, non-stick dishwasher safe basket, 1800W heating element.',
                'unit_price' => 5890.00,
                'discount_price' => 4999.00,
                'cost_price' => 3200.00,
                'stock_quantity' => 18,
                'reorder_level' => 4,
                'unit' => 'unit',
                'status' => 'Active',
                'image_url' => 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80',
            ]
        ];

        foreach ($products as $p) {
            Product::updateOrCreate(
                ['product_code' => $p['product_code']],
                $p
            );
        }
    }
}
