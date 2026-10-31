<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    /**
     * The signed-in user. Never includes the password hash.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nickname' => $this->nickname,
            'name' => $this->name,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
