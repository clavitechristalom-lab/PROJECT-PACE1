<?php
echo json_encode(\App\Models\PaymentSchedule::whereHas('installmentAccount', function ($iq) {
    $iq->whereHas('customer', function ($cq) {
        $cq->where('branch_id', 17);
    })->orWhereHas('sale', function ($sq) {
        $sq->where('branch_id', 17);
    });
})->get()->pluck('schedule_id'));
