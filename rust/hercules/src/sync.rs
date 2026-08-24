//! Tiny wrappers around `std::sync::RwLock` that recover from lock
//! poisoning instead of panicking: a bug in one function handler or one
//! data type resolution shouldn't permanently wedge every other concurrent
//! request sharing the lock. The poisoning panic already happened elsewhere
//! and was reported there; there is nothing more to gain by panicking again
//! here.

use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

pub fn read<T>(lock: &RwLock<T>) -> RwLockReadGuard<'_, T> {
    lock.read().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn write<T>(lock: &RwLock<T>) -> RwLockWriteGuard<'_, T> {
    lock.write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
