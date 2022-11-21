
conda env export --from-history --name gpt-j | grep -v '^prefix: ' > environment.yml
