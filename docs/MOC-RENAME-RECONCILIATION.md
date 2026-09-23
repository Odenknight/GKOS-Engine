# MOC rename reconciliation

The Node managed-MOC runtime requests full reconciliation for every delivered
rename event. A matching completed self-write digest at the reported path cannot
establish that another path was not removed or renamed. Ordinary change events
retain the existing bounded self-write suppression behavior.

The regression delivers a rename through the registered watcher callback after
startup has generated and recorded a MOC. It fails against the previous bundle
because no reconciliation is requested, and passes after the fix. This is a
deterministic callback test, not qualification of every operating system's event
sequence. Existing real file-edit, cross-folder rename and shutdown/recovery
tests also pass: 12 host tests and 67 related executor/reconciliation tests.

This does not enable product-host Effects or establish the remaining authority,
prepared-intent, generation-binding or native acceptance requirements.
