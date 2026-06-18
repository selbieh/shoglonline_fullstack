import factory

from apps.catalog.models import Category, Skill


class CategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Category
        django_get_or_create = ("slug",)

    name_ar = factory.Sequence(lambda n: f"تصنيف {n}")
    name_en = factory.Sequence(lambda n: f"Category {n}")
    slug = factory.Sequence(lambda n: f"category-{n}")
    is_active = True


class SkillFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Skill
        django_get_or_create = ("slug",)

    name_ar = factory.Sequence(lambda n: f"مهارة {n}")
    slug = factory.Sequence(lambda n: f"skill-{n}")
    is_active = True
