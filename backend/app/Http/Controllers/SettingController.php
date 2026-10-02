<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    public function index()
    {
        $settings = Setting::all()->pluck('value', 'key');
        return response()->json(['settings' => $settings]);
    }

    public function update(Request $request)
    {
        $data = $request->except(['_method', 'logo']); // don't bulk update logo file this way
        
        foreach ($data as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        if ($request->hasFile('logo')) {
            $path = $request->file('logo')->store('company', 'public');
            Setting::updateOrCreate(['key' => 'company_logo'], ['value' => '/storage/' . $path]);
        }

        return response()->json([
            'message' => 'Settings updated successfully',
            'settings' => Setting::all()->pluck('value', 'key')
        ]);
    }
}
