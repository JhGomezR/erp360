<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class RfqRequest extends Model
{
    use SoftDeletes;

    protected $table = 'rfq_requests';

    protected $fillable = [
        'rfq_number', 'title', 'requisition_id', 'status', 'deadline', 'notes', 'created_by',
    ];

    protected $casts = ['deadline' => 'date'];

    protected static function booted(): void
    {
        static::creating(function (self $rfq) {
            if (empty($rfq->rfq_number)) {
                do {
                    $num = 'RFQ-' . strtoupper(Str::random(6));
                } while (self::where('rfq_number', $num)->exists());
                $rfq->rfq_number = $num;
            }
        });
    }

    public function lines()       { return $this->hasMany(RfqLine::class, 'rfq_request_id'); }
    public function rfqSuppliers(){ return $this->hasMany(RfqSupplier::class, 'rfq_request_id'); }
}
