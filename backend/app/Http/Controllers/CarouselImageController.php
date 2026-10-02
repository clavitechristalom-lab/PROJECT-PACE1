<?php

namespace App\Http\Controllers;

use App\Models\CarouselImage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Services\NotificationService;

class CarouselImageController extends Controller
{
    public function index()
    {
        $images = CarouselImage::orderBy('order')->get();
        return response()->json($images);
    }

    public function active()
    {
        $images = CarouselImage::where('is_active', true)->orderBy('order')->get();
        return response()->json($images);
    }

    public function store(Request $request)
    {
        if (CarouselImage::count() >= 10) {
            return response()->json(['message' => 'Maximum limit of 10 carousel images reached.'], 422);
        }

        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:10240',
            'order' => 'integer'
        ]);

        $path = $request->file('image')->store('carousel', 'public');
        $urlBase = $request->getSchemeAndHttpHost() . '/storage/';
        $fullUrl = $urlBase . $path;
        
        $order = $request->input('order', CarouselImage::max('order') + 1);

        $image = CarouselImage::create([
            'image_url' => $fullUrl,
            'order' => $order,
            'is_active' => $request->input('is_active', true)
        ]);

        return response()->json($image, 201);
    }

    public function update(Request $request, $id)
    {
        $image = CarouselImage::findOrFail($id);

        if ($request->hasFile('image')) {
            $request->validate([
                'image' => 'image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            ]);
            
            // Delete old file if exists
            $oldPath = str_replace($request->getSchemeAndHttpHost() . '/storage/', '', $image->image_url);
            if (Storage::disk('public')->exists($oldPath)) {
                Storage::disk('public')->delete($oldPath);
            }
            
            $path = $request->file('image')->store('carousel', 'public');
            $urlBase = $request->getSchemeAndHttpHost() . '/storage/';
            $image->image_url = $urlBase . $path;
        }

        if ($request->has('order')) {
            $image->order = $request->order;
        }
        
        if ($request->has('is_active')) {
            $isActive = filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN);
            $image->is_active = $isActive;
        }

        $image->save();

        return response()->json($image);
    }

    public function destroy($id)
    {
        $image = CarouselImage::findOrFail($id);
        
        $oldPath = str_replace(request()->getSchemeAndHttpHost() . '/storage/', '', $image->image_url);
        if (Storage::disk('public')->exists($oldPath)) {
            Storage::disk('public')->delete($oldPath);
        }
        
        $image->delete();

        return response()->json(['message' => 'Image deleted successfully']);
    }
}
