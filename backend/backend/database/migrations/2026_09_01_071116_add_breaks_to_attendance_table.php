<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->time('break_out')->nullable()->after('time_in');
            $table->time('break_in')->nullable()->after('break_out');
            $table->time('lunch_out')->nullable()->after('break_in');
            $table->time('lunch_in')->nullable()->after('lunch_out');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn(['break_out', 'break_in', 'lunch_out', 'lunch_in']);
        });
    }
};
