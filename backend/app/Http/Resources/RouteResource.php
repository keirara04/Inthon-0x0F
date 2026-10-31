<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Wraps RouteService::route() output; shape documented there. */
class RouteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource;
    }
}
