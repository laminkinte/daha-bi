<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/** The in-app notification bell (Laravel database notifications). */
class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        return [
            'unread' => $user->unreadNotifications()->count(),
            'items' => $user->notifications()->latest()->limit(30)->get()->map(fn ($n) => [
                'id' => $n->id,
                'data' => $n->data,
                'read_at' => $n->read_at,
                'created_at' => $n->created_at,
            ]),
        ];
    }

    public function read(Request $request, string $id)
    {
        $request->user()->notifications()->whereKey($id)->update(['read_at' => now()]);

        return response()->noContent();
    }

    public function readAll(Request $request)
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->noContent();
    }
}
