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
        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('allow_installment')->default(false)->after('status');
            $table->timestamp('installment_allowed_at')->nullable()->after('allow_installment');
            $table->unsignedBigInteger('installment_allowed_by')->nullable()->after('installment_allowed_at');
            $table->text('installment_notes')->nullable()->after('installment_allowed_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'allow_installment',
                'installment_allowed_at',
                'installment_allowed_by',
                'installment_notes',
            ]);
        });
    }
};
