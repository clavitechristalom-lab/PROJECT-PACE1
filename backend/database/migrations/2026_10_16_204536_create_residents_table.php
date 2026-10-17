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
        if (!Schema::hasTable('residents')) {
            Schema::create('residents', function (Blueprint $table) {
                $table->id();
                $table->string('firstName', 100)->default('User');
                $table->string('lastName', 100)->nullable();
                $table->string('email', 191)->unique();
                $table->string('mobile_password', 255)->nullable();
                $table->string('mobile_account_status', 50)->default('active');
                $table->boolean('has_mobile_account')->default(true);
                $table->timestamps();
            });

            // Populate existing users into residents
            $users = DB::table('users')->whereNotNull('email')->get();
            foreach ($users as $u) {
                if (filter_var($u->email, FILTER_VALIDATE_EMAIL)) {
                    DB::table('residents')->insertOrIgnore([
                        'firstName'             => $u->username,
                        'email'                 => $u->email,
                        'mobile_password'       => $u->password_hash,
                        'mobile_account_status' => 'active',
                        'has_mobile_account'    => 1,
                        'created_at'            => now(),
                        'updated_at'            => now(),
                    ]);
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('residents');
    }
};
