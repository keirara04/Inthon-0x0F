<?php

namespace App\Exceptions;

use Exception;

class NotFloorPlanException extends Exception
{
    public function __construct()
    {
        parent::__construct('평면도가 아닌 사진이에요');
    }
}
