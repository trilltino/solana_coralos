/**
 * verify.ts — confirm an on-chain payment for the bare-metal 402 seller.
 *
 * Uses Solana Pay's reference-key mechanism: the seller embeds a unique reference public key
 * in each challenge; the buyer's transfer writes that key as a ReadOnly account. We then look
 * the payment up by reference (no memo-string matching) and validate the amount/recipient.
 *
 * `findReference` / `validateTransfer` are from @solana/pay
 * (ref/solana-pay/typescript/packages/solana-pay/core/src/).
 */
import { Connection, PublicKey } from '@solana/web3.js'
import { findReference, validateTransfer } from '@solana/pay'
import BigNumber from 'bignumber.js'

/**
 * Confirm that `reference` corresponds to a finalized transfer of at least `amountSol`
 * to `recipient`. Returns the transaction signature on success, or null if not found/invalid.
 */
export async function verifyPayment(
  conn: Connection,
  reference: PublicKey,
  recipient: PublicKey,
  amountSol: number,
): Promise<string | null> {
  try {
    const found = await findReference(conn, reference, { finality: 'confirmed' })
    await validateTransfer(
      conn,
      found.signature,
      { recipient, amount: new BigNumber(amountSol), reference },
      { commitment: 'confirmed' },
    )
    return found.signature
  } catch {
    return null
  }
}
