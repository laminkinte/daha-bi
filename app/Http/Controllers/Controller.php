<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

abstract class Controller
{
    // $this->authorize('ability', $model) — rules live in app/Policies, one place per model.
    use AuthorizesRequests;
}
