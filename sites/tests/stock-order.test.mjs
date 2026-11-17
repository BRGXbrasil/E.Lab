import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateStockOrder, validatedStockOrderReport} from '../src/stock-order.js';

test('pedido usa giro de 30 dias como limite, com lead de 10 dias', () => {
  const item = calculateStockOrder({balance:1, minimum:5, outflow:2, review:false});
  assert.equal(item.status,'repor');
  assert.equal(item.orderUnits,2);
  assert.ok(Math.abs(item.arrival - 1/3) < 1e-12);
  assert.equal(calculateStockOrder({balance:1, minimum:5, outflow:1, review:false}).status,'sem_reposicao');
  assert.equal(calculateStockOrder({balance:1, minimum:5, outflow:0, review:false}).orderUnits,null);
  assert.equal(calculateStockOrder({balance:null, minimum:5, outflow:2, review:true}).status,'conferir');
  assert.equal(calculateStockOrder({balance:1, minimum:5, outflow:9, review:false}).shortage,2);
});

test('referência validada coincide com as quantidades publicadas no relatório', () => {
  const {rows,date,movementFrom,movementTo} = validatedStockOrderReport();
  assert.deepEqual([date,movementFrom,movementTo],['2026-11-14','2026-10-15','2026-11-13']);
  const orders=rows.filter(row=>row.status==='repor');
  assert.equal(rows.length,540);
  assert.equal(rows.filter(row=>row.status==='conferir').length,96);
  assert.equal(orders.length,4);
  assert.equal(orders.reduce((sum,row)=>sum+row.orderUnits,0),8);
  assert.equal(orders.find(row=>row.name==='EMULSÃO 4%').orderUnits,4);
  assert.equal(orders.find(row=>row.name.startsWith('MASCARA FUSION')).orderUnits,1);
  assert.equal(orders.filter(row=>row.brand.toUpperCase()==='KEUNE').length,0);
});
