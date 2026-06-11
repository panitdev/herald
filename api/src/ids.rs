use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

// Custom epoch: 2024-01-01T00:00:00Z in milliseconds
const EPOCH_MS: u64 = 1_704_067_200_000;
const NODE_BITS: u64 = 10;
const SEQ_BITS: u64 = 12;
const MAX_SEQ: i64 = (1 << SEQ_BITS) - 1;

struct Inner {
    node_id: i64,
    sequence: i64,
    last_ms: u64,
}

impl Inner {
    fn generate(&mut self) -> i64 {
        let mut now = (SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64)
            .saturating_sub(EPOCH_MS);

        if now == self.last_ms {
            self.sequence = (self.sequence + 1) & MAX_SEQ;
            if self.sequence == 0 {
                while now <= self.last_ms {
                    now = (SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64)
                        .saturating_sub(EPOCH_MS);
                }
            }
        } else {
            self.sequence = 0;
        }
        self.last_ms = now;

        ((now as i64) << (NODE_BITS + SEQ_BITS) as i64)
            | (self.node_id << SEQ_BITS as i64)
            | self.sequence
    }
}

#[derive(Clone)]
pub struct IdGen(Arc<Mutex<Inner>>);

impl IdGen {
    /// `machine_id` and `node_id` each occupy 5 bits of the 10-bit node field.
    pub fn new(machine_id: i32, node_id: i32) -> Self {
        let node = ((machine_id as i64 & 0x1F) << 5) | (node_id as i64 & 0x1F);
        Self(Arc::new(Mutex::new(Inner {
            node_id: node,
            sequence: 0,
            last_ms: 0,
        })))
    }

    pub fn next(&self) -> i64 {
        self.0.lock().unwrap().generate()
    }
}
