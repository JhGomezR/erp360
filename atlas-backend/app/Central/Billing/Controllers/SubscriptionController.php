<?php

namespace App\Central\Billing\Controllers;

use App\Central\Billing\Models\Subscription;
use App\Central\Billing\Models\SubscriptionPayment;
use App\Central\Params\Models\SystemParam;
use App\Central\Shared\Traits\HasCentralAudit;
use App\Central\Tenants\Models\Tenant;
use App\Mail\BillingReminderMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class SubscriptionController extends Controller
{
    use HasCentralAudit;

    public function index(Request $request): JsonResponse
    {
        $query = Subscription::with(['tenant', 'plan']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->tenant_id);
        }

        $subscriptions = $query->orderBy('created_at', 'desc')->paginate(20);

        return response()->json($subscriptions);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenant_id'     => ['required', 'string', 'exists:tenants,id'],
            'plan_id'       => ['required', 'integer', 'exists:plans,id'],
            'billing_cycle' => ['required', 'in:monthly,annual'],
            'starts_at'     => ['required', 'date'],
            'amount'        => ['required', 'numeric', 'min:0'],
            'notes'         => ['nullable', 'string'],
        ]);

        $startsAt = \Carbon\Carbon::parse($data['starts_at']);

        $endsAt = $data['billing_cycle'] === 'annual'
            ? $startsAt->copy()->addYear()
            : $startsAt->copy()->addMonth();

        $subscription = Subscription::create([
            'tenant_id'       => $data['tenant_id'],
            'plan_id'         => $data['plan_id'],
            'billing_cycle'   => $data['billing_cycle'],
            'starts_at'       => $startsAt->toDateString(),
            'ends_at'         => $endsAt->toDateString(),
            'next_billing_at' => $endsAt->toDateString(),
            'amount'          => $data['amount'],
            'status'          => 'trial',
            'notes'           => $data['notes'] ?? null,
        ]);

        $subscription->load(['tenant', 'plan']);

        $this->centralAudit(
            action:      'subscription.created',
            level:       'success',
            description: "Suscripción creada: {$subscription->tenant->name} — Plan {$subscription->plan->name} ({$data['billing_cycle']})",
            module:      'billing',
            after:       ['tenant_id' => $data['tenant_id'], 'plan_id' => $data['plan_id'], 'billing_cycle' => $data['billing_cycle'], 'amount' => $data['amount']],
        );

        return response()->json($subscription, 201);
    }

    public function show(string $id): JsonResponse
    {
        $subscription = Subscription::with(['tenant', 'plan', 'payments'])
            ->findOrFail($id);

        return response()->json($subscription);
    }

    public function recordPayment(Request $request, string $id): JsonResponse
    {
        $subscription = Subscription::findOrFail($id);

        $data = $request->validate([
            'amount'         => ['required', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'in:cash,transfer,card,other'],
            'reference'      => ['nullable', 'string'],
            'paid_at'        => ['nullable', 'date'],
            'due_at'         => ['required', 'date'],
            'notes'          => ['nullable', 'string'],
        ]);

        $payment = SubscriptionPayment::create([
            'subscription_id' => $subscription->id,
            'tenant_id'       => $subscription->tenant_id,
            'amount'          => $data['amount'],
            'status'          => isset($data['paid_at']) ? 'paid' : 'pending',
            'payment_method'  => $data['payment_method'] ?? null,
            'reference'       => $data['reference'] ?? null,
            'paid_at'         => $data['paid_at'] ?? null,
            'due_at'          => $data['due_at'],
            'notes'           => $data['notes'] ?? null,
            'recorded_by'     => auth('api')->id(),
        ]);

        if ($payment->status === 'paid') {
            $nextBilling = $subscription->next_billing_at
                ? \Carbon\Carbon::parse($subscription->next_billing_at)
                : \Carbon\Carbon::parse($subscription->ends_at);

            $nextBilling = $subscription->billing_cycle === 'annual'
                ? $nextBilling->addYear()
                : $nextBilling->addMonth();

            DB::transaction(function () use ($subscription, $nextBilling) {
                $subscription->update([
                    'status'          => 'active',
                    'next_billing_at' => $nextBilling->toDateString(),
                ]);

                $tenant = Tenant::find($subscription->tenant_id);
                if ($tenant && $tenant->status === 'suspended') {
                    $tenant->update(['status' => 'active']);

                    DB::table('audit_logs')->insert([
                        'action'      => 'tenant_reactivated_payment',
                        'entity_type' => 'tenant',
                        'entity_id'   => $tenant->id,
                        'user_id'     => auth('api')->id(),
                        'after'       => json_encode([
                            'subscription_id' => $subscription->id,
                            'next_billing_at' => $nextBilling->toDateString(),
                            'status'          => 'active',
                        ]),
                        'description' => "Tenant reactivado tras pago. Proximo cobro: {$nextBilling->toDateString()}",
                        'created_at'  => now(),
                    ]);

                    $email = $tenant->email ?? $tenant->owner?->email;
                    if ($email) {
                        try {
                            $frontendUrl = SystemParam::get('general.frontend_url', config('app.frontend_url', config('app.url')));
                            Mail::to($email)->queue(new BillingReminderMail(
                                type:       'reactivated',
                                tenantName: $tenant->name,
                                amount:     (float) $subscription->amount,
                                dueDate:    $nextBilling->toDateString(),
                                daysLeft:   0,
                                paymentUrl: rtrim($frontendUrl, '/') . '/billing',
                                appName:    SystemParam::get('general.app_name', 'Atlas ERP'),
                            ));
                        } catch (\Throwable) {}
                    }
                }
            });
        }

        $subscription->load('tenant');
        $tenantName = $subscription->tenant->name ?? "#{$subscription->tenant_id}";

        $this->centralAudit(
            action:      'subscription.payment_recorded',
            level:       $payment->status === 'paid' ? 'success' : 'info',
            description: "Pago registrado: {$tenantName} — \${$data['amount']} — " . ($payment->status === 'paid' ? 'Pagado' : 'Pendiente'),
            module:      'billing',
            after:       ['subscription_id' => $id, 'amount' => $data['amount'], 'status' => $payment->status, 'payment_method' => $data['payment_method'] ?? null],
        );

        return response()->json($payment->fresh(), 201);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $subscription = Subscription::with('tenant')->findOrFail($id);
        $tenantName   = $subscription->tenant->name ?? "#{$subscription->tenant_id}";

        $subscription->update([
            'status'       => 'cancelled',
            'cancelled_at' => now()->toDateString(),
        ]);

        $this->centralAudit(
            action:      'subscription.cancelled',
            level:       'critical',
            description: "Suscripción cancelada: {$tenantName} — ID #{$id}",
            module:      'billing',
            before:      ['subscription_id' => $id, 'status' => 'active', 'tenant' => $tenantName],
        );

        return response()->json($subscription);
    }

    public function tenantHistory(string $tenantId): JsonResponse
    {
        $subscriptions = Subscription::with(['plan', 'payments'])
            ->where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($subscriptions);
    }
}
