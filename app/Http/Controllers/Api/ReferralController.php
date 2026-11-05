<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'referral_code' => $user->referral_code,
            'referral_count' => $user->referrals()->count(),
            'referrals' => $user->referrals()
                ->latest()
                ->get(['id', 'name', 'created_at']),
        ]);
    }
}
