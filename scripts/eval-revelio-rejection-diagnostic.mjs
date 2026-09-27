export function formatRejectedOperationDiagnostic(operation) {
  const shape = operation.revisionInputShape;
  return JSON.stringify({
    type: operation.type,
    status: operation.status,
    rejectionCode: operation.rejectionCode,
    revisionInputShape: shape && {
      sourceMatches: shape.sourceMatches,
      changedPositions: shape.changedPositions,
      retainedIdOrderValid: shape.retainedIdOrderValid,
      duplicatePathIds: shape.duplicatePathIds,
      reusedPathRevisionWithChangedContent: shape.reusedPathRevisionWithChangedContent,
      replacementSetRevisionExists: shape.replacementSetRevisionExists,
    },
    pathSetCountBefore: operation.pathSetCountBefore,
    pathSetCountAfter: operation.pathSetCountAfter,
    mapRevisionBefore: operation.mapRevisionBefore,
    authoritativeRevision: operation.authoritativeRevision,
    sourceIdReused: operation.sourceIdReused,
  });
}

export function firstRejectedOperationDiagnostic(operations) {
  const rejected = operations.find((operation) => operation.status === 'rejected');
  return rejected ? formatRejectedOperationDiagnostic(rejected) : null;
}
