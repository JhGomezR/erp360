<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;
use App\Tenant\Inventory\Models\Product;

class RfqLine extends Model
{
    protected $table = 'rfq_lines';
    protected $fillable = ['rfq_request_id','product_id','description','quantity','unit','notes','sort_order'];
    protected $casts = ['quantity' => 'float'];

    public function product() { return $this->belongsTo(Product::class, 'product_id'); }
    public function responseItems() { return $this->hasMany(RfqResponseItem::class, 'rfq_line_id'); }
}
