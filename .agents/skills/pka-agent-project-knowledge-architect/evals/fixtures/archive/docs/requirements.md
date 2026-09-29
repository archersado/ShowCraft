# 订单处理需求

- 订单状态依次为 `created`、`paid`、`allocated`、`picked`、`completed`。
- 缺货订单进入 `review_required`，由站长人工选择替代品或退款。
- 所有状态变化必须留下操作者和时间。
