# Fix GCP Org Policy for Asterley Bros

## What's Wrong
The organization's IAM policy blocks our Cloud Functions from being publicly accessible. This breaks all AI features (email generation, strategy, sending) on the deployed site.

## What We Need
The **Organization Administrator** for `absolutionlabs.com` to grant one role to one person. Takes 2 minutes.

---

## Instructions for the Org Admin

1. Go to https://console.cloud.google.com
2. Click the project dropdown at the top of the page (next to "Google Cloud")
3. In the popup, click the **"All"** tab
4. **Important:** Select the **organization** `absolutionlabs.com` at the top level — NOT a project. It must say "absolutionlabs.com" as the organization, not "asterley-bros" or any other project name.
5. In the left sidebar, go to **IAM & Admin → IAM**
6. Click the **"Grant Access"** button at the top
7. In the **"New principals"** field, type: `chantal@absolutionlabs.com`
8. In the **"Select a role"** dropdown, search for: `Organization Policy Administrator`
9. Select it and click **Save**

That's all. Nothing else to do.

---

## What Chantal Does After

Once the role is granted, Chantal runs two commands:

```bash
gcloud org-policies reset iam.allowedPolicyMemberDomains --project=asterley-bros-b29c0
```

```bash
firebase deploy --only functions
```

Everything works after that.
