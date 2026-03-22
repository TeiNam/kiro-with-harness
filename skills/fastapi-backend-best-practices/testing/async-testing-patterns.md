## Async Testing Patterns

### Timeout Testing

```python
async def test_slow_operation_has_timeout():
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(
            slow_external_call(),
            timeout=5.0,
        )
```

### Concurrency Testing

```python
async def test_concurrent_stock_update(client: AsyncClient):
    """Ensure consistency during concurrent stock deduction."""
    product_id = 1  # Product with 100 stock

    tasks = [
        client.post(f"/api/v1/products/{product_id}/purchase", json={"qty": 1})
        for _ in range(100)
    ]
    results = await asyncio.gather(*tasks)

    success = sum(1 for r in results if r.status_code == 200)
    conflict = sum(1 for r in results if r.status_code == 409)

    # Stock must be exactly 0
    product = await client.get(f"/api/v1/products/{product_id}")
    assert product.json()["stock"] == 0
```

### Event Publishing Testing

```python
async def test_order_placed_publishes_event(service, mock_event_bus):
    await service.place_order(order_id=1)

    mock_event_bus.publish.assert_awaited_once()
    event = mock_event_bus.publish.call_args[0][0]
    assert event.event_type == "order.placed"
    assert event.order_id == 1
```
