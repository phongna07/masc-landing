ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_order_snapshot_shape";--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_order_snapshot_shape" CHECK (coalesce(
		"ticket_orders"."snapshot"->>'currency' = 'VND'
		and jsonb_typeof("ticket_orders"."snapshot"->'totalPrice') = 'number'
		and ("ticket_orders"."snapshot"->>'totalPrice')::numeric between 0 and 2000000000
		and ("ticket_orders"."snapshot"->>'totalPrice')::numeric = trunc(("ticket_orders"."snapshot"->>'totalPrice')::numeric)
		and (("ticket_orders"."snapshot"->>'totalPrice')::numeric > 0 or "ticket_orders"."promo_id" is not null)
		and (
			(not ("ticket_orders"."snapshot" ? 'bundleQuantity') and not ("ticket_orders"."snapshot" ? 'unitPrice'))
			or (jsonb_typeof("ticket_orders"."snapshot"->'bundleQuantity') = 'number'
				and ("ticket_orders"."snapshot"->>'bundleQuantity')::numeric between 1 and 10
				and ("ticket_orders"."snapshot"->>'bundleQuantity')::numeric = trunc(("ticket_orders"."snapshot"->>'bundleQuantity')::numeric)
				and jsonb_typeof("ticket_orders"."snapshot"->'unitPrice') = 'number'
				and ("ticket_orders"."snapshot"->>'unitPrice')::numeric between 0 and 1000000000
				and ("ticket_orders"."snapshot"->>'unitPrice')::numeric = trunc(("ticket_orders"."snapshot"->>'unitPrice')::numeric))
		)
		and ("ticket_orders"."snapshot"->>'totalPrice')::numeric = coalesce(("ticket_orders"."snapshot"->>'unitPrice')::numeric, ("ticket_orders"."snapshot"->>'totalPrice')::numeric) * coalesce(("ticket_orders"."snapshot"->>'bundleQuantity')::numeric, 1)
		and jsonb_typeof("ticket_orders"."snapshot"->'quantity') = 'number'
		and (
			("ticket_orders"."snapshot"->>'packageName' = 'Silver' and "ticket_orders"."snapshot"->>'category' = 'normal' and ("ticket_orders"."snapshot"->>'quantity')::numeric = coalesce(("ticket_orders"."snapshot"->>'bundleQuantity')::numeric, 1))
			or ("ticket_orders"."snapshot"->>'packageName' = 'Golden' and "ticket_orders"."snapshot"->>'category' = 'normal' and ("ticket_orders"."snapshot"->>'quantity')::numeric = 2 * coalesce(("ticket_orders"."snapshot"->>'bundleQuantity')::numeric, 1))
			or ("ticket_orders"."snapshot"->>'packageName' = 'Platinum' and "ticket_orders"."snapshot"->>'category' = 'normal' and ("ticket_orders"."snapshot"->>'quantity')::numeric = 3 * coalesce(("ticket_orders"."snapshot"->>'bundleQuantity')::numeric, 1))
			or ("ticket_orders"."snapshot"->>'packageName' = 'VIP' and "ticket_orders"."snapshot"->>'category' = 'vip' and ("ticket_orders"."snapshot"->>'quantity')::numeric = coalesce(("ticket_orders"."snapshot"->>'bundleQuantity')::numeric, 1))
		), false));