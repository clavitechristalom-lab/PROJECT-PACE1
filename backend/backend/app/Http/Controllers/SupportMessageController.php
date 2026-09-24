<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

use App\Models\SupportMessage;
use App\Models\SystemLog;
use App\Services\NotificationService;

class SupportMessageController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = SupportMessage::with('customer')->orderBy('created_at', 'desc');
        
        if ($user && $user->role === 'Customer') {
            $query->where('customer_id', $user->customer_id);
        }

        $messages = $query->get();
        return response()->json(['messages' => $messages]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'topic' => 'required|string|max:255',
            'message' => 'required|string',
        ]);

        $user = $request->user();
        
        $msg = SupportMessage::create([
            'customer_id' => $user->customer ? $user->customer->customer_id : (\App\Models\Customer::first()->customer_id ?? null), // Fallback if admin testing
            'topic' => $validated['topic'],
            'message' => $validated['message'],
        ]);

        $customerName = $msg->customer ? "{$msg->customer->first_name} {$msg->customer->last_name}" : 'A customer';

        $notificationData = [
            'type' => 'support_message',
            'title' => 'New Support Message',
            'message' => "{$customerName} sent a support message regarding '{$msg->topic}'.",
            'module' => 'Support',
            'action_url' => '/support',
            'priority' => 'normal',
        ];

        NotificationService::sendToAdmins($notificationData);
        // If we want to send to store admins too:
        // Normally we'd pass a branch ID, but support is usually global. We'll send to all store admins.
        NotificationService::sendToStoreAdmins($notificationData);

        SystemLog::create([
            'user_id' => $user->user_id ?? 1,
            'module' => 'Support',
            'action' => 'Submitted Feedback',
            'description' => "Customer {$customerName} submitted feedback: {$msg->topic}",
            'ip_address' => $request->ip()
        ]);

        return response()->json(['message' => 'Message sent successfully', 'data' => $msg], 201);
    }

    public function update(Request $request, $id)
    {
        $msg = SupportMessage::findOrFail($id);
        $updateData = [];
        if ($request->has('status')) {
            $updateData['status'] = $request->input('status');
        }

        if ($request->has('response')) {
            $updateData['response'] = $request->input('response');
            $updateData['responded_by'] = $request->user() ? $request->user()->user_id : null;
            $updateData['responded_at'] = now();
            // Default status to Responded if response is provided
            if (!isset($updateData['status'])) {
                 $updateData['status'] = 'Responded';
            }
        }

        if ($request->has('customer_reply')) {
            $updateData['customer_reply'] = $request->input('customer_reply');
            $updateData['customer_reply_at'] = now();
            // Default status to Awaiting response if customer replies? No, requirement says admin viewing only
            // Let's keep status as Responded or whatever it was. 
        }

        if (!empty($updateData)) {
            $msg->update($updateData);
        }
        
        $action = $request->has('customer_reply') ? 'Customer Replied to Support Message' : 'Updated Support Status';
        $description = $request->has('customer_reply') ? "Customer replied to support message #{$id}" : "Responded to support message #{$id}";

        SystemLog::create([
            'user_id' => $request->user() ? $request->user()->user_id : 1,
            'module' => 'Support',
            'action' => $action,
            'description' => $description,
            'ip_address' => $request->ip()
        ]);

        if ($request->has('response') && $msg->customer) {
            // Notify Customer
            $customerUserId = \App\Models\User::where('customer_id', $msg->customer_id)->value('user_id');
            if ($customerUserId) {
                NotificationService::sendToUser($customerUserId, [
                    'type' => 'support_response',
                    'title' => 'Response to your Feedback',
                    'message' => 'An admin has responded to your feedback regarding "' . $msg->topic . '".',
                    'module' => 'Support',
                    'action_url' => '/customer/dashboard',
                    'priority' => 'normal',
                ]);
            }
        }

        if ($request->has('customer_reply')) {
            $customerName = $msg->customer ? "{$msg->customer->first_name} {$msg->customer->last_name}" : 'A customer';
            NotificationService::sendToAdmins([
                'type' => 'support_reply',
                'title' => 'New Customer Reply',
                'message' => "{$customerName} replied to their feedback regarding '{$msg->topic}'.",
                'module' => 'Support',
                'action_url' => '/support',
                'priority' => 'normal',
            ]);
            NotificationService::sendToStoreAdmins([
                'type' => 'support_reply',
                'title' => 'New Customer Reply',
                'message' => "{$customerName} replied to their feedback regarding '{$msg->topic}'.",
                'module' => 'Support',
                'action_url' => '/support',
                'priority' => 'normal',
            ]);
        }

        return response()->json(['message' => 'Status updated']);
    }
}
