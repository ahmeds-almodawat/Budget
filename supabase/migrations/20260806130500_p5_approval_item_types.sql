-- P5: extend approval inbox item types (separate transaction from view usage)

ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'delegation';
ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'purchase_requisition';
ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'approval_rule';
