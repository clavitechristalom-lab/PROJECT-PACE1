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
        $user = $request->user();
        $isCustomer = $user && $user->role === 'Customer';

        if ($request->has('new_message')) {
            $history = $msg->chat_history ?? [];
            
            // Count total messages including initial message + legacy response + legacy reply + history
            $legacyCount = 1 + ($msg->response ? 1 : 0) + ($msg->customer_reply ? 1 : 0);
            $totalMessages = $legacyCount + count($history);

            if ($totalMessages >= 20) {
                return response()->json(['message' => 'Conversation limit reached (20 messages). Please start a new conversation.'], 422);
            }

            $history[] = [
                'sender' => $isCustomer ? 'Customer' : 'Admin',
                'text' => $request->input('new_message'),
                'timestamp' => now()->toDateTimeString(),
            ];

            $msg->chat_history = $history;
            $msg->status = 'Responded';
            $msg->save();

            // Send Notifications
            if ($isCustomer) {
                $customerName = $msg->customer ? "{$msg->customer->first_name} {$msg->customer->last_name}" : 'A customer';
                $notifData = [
                    'type' => 'support_reply',
                    'title' => 'New Customer Message',
                    'message' => "{$customerName} sent a message in conversation '{$msg->topic}'.",
                    'module' => 'Support',
                    'action_url' => '/support',
                    'priority' => 'normal',
                ];
                NotificationService::sendToAdmins($notifData);
                NotificationService::sendToStoreAdmins($notifData);
            } else {
                $customerUserId = \App\Models\User::where('customer_id', $msg->customer_id)->value('user_id');
                if ($customerUserId) {
                    NotificationService::sendToUser($customerUserId, [
                        'type' => 'support_response',
                        'title' => 'New Support Message',
                        'message' => 'An admin has sent a message in your conversation "' . $msg->topic . '".',
                        'module' => 'Support',
                        'action_url' => '/customer/dashboard',
                        'priority' => 'normal',
                    ]);
                }
            }

            return response()->json(['message' => 'Message added to conversation successfully', 'data' => $msg]);
        }

        // Legacy status update
        if ($request->has('status')) {
            $msg->update(['status' => $request->input('status')]);
            return response()->json(['message' => 'Status updated']);
        }

        return response()->json(['message' => 'No action performed']);
    }

    public function destroy($id)
    {
        $msg = SupportMessage::find($id);
        if (!$msg) {
            return response()->json(['message' => 'Support message not found'], 404);
        }

        // Only allow customer to delete their own, or Admin to delete any.
        // For simplicity, relying on Auth logic similar to update() if needed,
        // but since both Customer and Admin can delete it, we'll check if the user is a customer
        $user = auth()->user();
        if ($user->role === 'Customer') {
            if ($msg->customer_id != $user->customer_id) {
                return response()->json(['message' => 'Unauthorized to delete this message'], 403);
            }
        }

        $msg->delete();
        return response()->json(['message' => 'Support message deleted successfully']);
    }
}
